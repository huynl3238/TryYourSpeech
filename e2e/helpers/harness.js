import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { chromium } from 'playwright';

// Cùng file .env mà backend đang chạy đọc, nên token ký ra ở đây được chính
// backend đó chấp nhận. Không nhân bản secret sang chỗ thứ hai.
dotenv.config({ path: fileURLToPath(new URL('../../backend/.env', import.meta.url)) });

export const APP_URL = process.env.E2E_APP_URL || 'http://localhost:5173';
const COOKIE_NAME = 'tys_access';

export const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'ielts_speaking',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Đăng nhập bằng Google hay email đều không tự động hoá được: một cái cần OAuth
// thật, một cái cần bấm link trong email xác minh. Nên tạo tài khoản thẳng trong
// database rồi tự ký token — đúng đường mà chính socket/auth.js đã mở sẵn cho
// "non-browser clients (tests, scripts)".
export async function createTestUser(displayName, band) {
  const id = randomUUID();
  // Đúng bộ cột mà test backend đang dùng. getAuthUserById chỉ SELECT * FROM users
  // và không đòi email đã xác minh, nên một dòng trơn là đủ để đăng nhập được.
  await pool.query(
    `INSERT INTO users (id, display_name, band, user_role) VALUES ($1, $2, $3, 'student')`,
    [id, displayName, band]
  );

  // Hạn 2 giờ thay vì 15 phút như bản thật: một lượt chạy đủ luồng luyện tập dài
  // hơn 15 phút, và token hết hạn giữa bài sẽ làm test đỏ vì lý do không liên quan.
  const token = jwt.sign({ sub: id, role: 'student' }, process.env.JWT_SECRET, {
    expiresIn: '2h',
  });

  return { id, displayName, band, token };
}

export async function deleteTestUsers(userIds) {
  if (userIds.length === 0) return;

  await pool.query(
    `DELETE FROM ai_results WHERE turn_id IN (
       SELECT t.id FROM turns t JOIN sessions s ON s.id = t.session_id
       WHERE s.user_a_id = ANY($1) OR s.user_b_id = ANY($1))`,
    [userIds]
  );
  await pool.query(
    `DELETE FROM peer_notes WHERE turn_id IN (
       SELECT t.id FROM turns t JOIN sessions s ON s.id = t.session_id
       WHERE s.user_a_id = ANY($1) OR s.user_b_id = ANY($1))`,
    [userIds]
  );
  await pool.query(
    `DELETE FROM session_ai_results WHERE session_id IN (
       SELECT id FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1))`,
    [userIds]
  );
  await pool.query(
    `DELETE FROM turns WHERE session_id IN (
       SELECT id FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1))`,
    [userIds]
  );
  await pool.query('DELETE FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1)', [userIds]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
}

// Micro và camera giả của Chromium. Nếu thiếu, getUserMedia bị từ chối và app
// dừng ở màn "Cần quyền truy cập Mic & Camera" — không tới được WebRTC.
// fake-ui trả lời hộ hộp thoại xin quyền; fake-device sinh tiếng bíp và hình mẫu.
export async function launchBrowser() {
  return await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

// Mỗi người luyện là một context riêng, tức một kho cookie riêng. Hai tab trong
// cùng một trình duyệt sẽ dùng chung cookie, nghĩa là cùng một tài khoản — và
// server chặn đúng trường hợp đó ("Tài khoản của bạn đang tìm đối tác ở một tab
// khác"), nên hai context là điều kiện bắt buộc chứ không phải cho gọn.
export async function openAs(browser, user) {
  const context = await browser.newContext({
    permissions: ['microphone', 'camera'],
  });

  await context.addCookies([
    {
      name: COOKIE_NAME,
      value: user.token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();
  const socketEvents = [];

  // Nghe thẳng sự kiện socket thay vì đoán qua giao diện: 'partner_reconnecting'
  // và 'session_resumed' là thứ cần khẳng định, và chúng không luôn để lại dấu
  // vết nhìn thấy được trên màn hình.
  await page.exposeFunction('__e2eRecord', (name) => {
    socketEvents.push({ name, at: Date.now() });
  });
  // onAny là API sẵn có của socket.io-client v4, không phải vá hàm nội bộ. Phải
  // chờ vì window.__tysSocket chỉ xuất hiện sau khi module socket được nạp.
  await page.addInitScript(() => {
    const attach = setInterval(() => {
      const socket = window.__tysSocket;
      if (!socket || window.__e2eAttached) return;
      window.__e2eAttached = true;
      socket.onAny((name) => window.__e2eRecord(String(name)));
      clearInterval(attach);
    }, 50);
  });

  return {
    context,
    page,
    user,
    events: () => socketEvents.map((item) => item.name),
    hasEvent: (name) => socketEvents.some((item) => item.name === name),
  };
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitUntil(check, { timeoutMs = 30000, label = 'điều kiện' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;

  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await delay(200);
  }

  throw new Error(`Hết ${timeoutMs}ms mà chưa đạt: ${label}`);
}

// Bằng chứng thật rằng âm thanh chảy qua, đọc từ chính kết nối WebRTC. Mạnh hơn
// việc người dùng nói "tôi nghe được": nó đo được CẢ HAI chiều, nên bắt đúng lỗi
// answer chỉ-nhận-không-gửi (một bên nghe được, bên kia im lặng).
export async function readAudioStats(page) {
  return await page.evaluate(async () => {
    const pc = window.__tysPeerConnection;
    if (!pc) return { error: 'khong tim thay peer connection' };

    const stats = await pc.getStats();
    let bytesReceived = 0;
    let packetsReceived = 0;
    let bytesSent = 0;

    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'audio') {
        bytesReceived += report.bytesReceived || 0;
        packetsReceived += report.packetsReceived || 0;
      }
      if (report.type === 'outbound-rtp' && report.kind === 'audio') {
        bytesSent += report.bytesSent || 0;
      }
    });

    return { connectionState: pc.connectionState, bytesReceived, packetsReceived, bytesSent };
  });
}

export async function getSessionStatus(sessionId) {
  const result = await pool.query('SELECT status FROM sessions WHERE id = $1', [sessionId]);
  return result.rows[0]?.status || null;
}

// Cả hai server dev phải đang chạy. Báo rõ ngay từ đầu, vì nếu không thì mọi
// assertion phía sau đều đỏ với lý do sai.
export async function requireDevServers() {
  const problems = [];

  try {
    const health = await fetch('http://localhost:3001/api/health');
    const body = await health.json();
    if (body.services?.database?.ok !== true) {
      problems.push('backend chạy nhưng database chưa lên — chạy: docker compose up -d');
    }
  } catch {
    problems.push('backend :3001 chưa chạy — chạy: cd backend && npm run dev');
  }

  try {
    await fetch(APP_URL);
  } catch {
    problems.push(`frontend ${APP_URL} chưa chạy — chạy: cd frontend && npm run dev`);
  }

  return problems;
}
