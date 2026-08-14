import { unlink } from 'node:fs/promises';
import 'dotenv/config';
import pool from '../config/db.js';
import { resolveUploadAudioPath } from '../services/uploadPaths.js';

// Xoá lịch sử luyện tập của một người — đúng những phiên mà trang "Lịch sử
// luyện tập" đang hiện — mà KHÔNG xoá tài khoản của họ.
//
// Khác `db:wipe-users` ở chỗ đó: lệnh kia xoá sạch mọi người, nên người chạy
// mất luôn tài khoản, mất quyền admin đã cấp bằng `db:set-role`, và phải đăng
// nhập lại từ đầu. Ở đây tài khoản, quyền, và bộ câu hỏi đều nguyên vẹn.
//
// Mặc định CHỈ xem trước, không xoá gì. Phải thêm `--yes` mới thật sự xoá. Chọn
// như vậy vì lệnh này hay được chạy trên server thật, gõ tay, lúc đang gấp —
// đúng ba điều kiện để xoá nhầm một thứ không lấy lại được.

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const emailArg = args.find((arg) => arg.startsWith('--email='));
const email = emailArg ? emailArg.slice('--email='.length).trim().toLowerCase() : null;

// Thứ tự theo khoá ngoại: bảng nào trỏ tới phiên thì phải xoá trước phiên.
// `ai_usage.session_id` không có ở đây vì nó là ON DELETE SET NULL — nhật ký
// lượng dùng API phải sống sót qua việc xoá phiên, vì API thì đã gọi thật và
// đã tốn tiền thật rồi.
const CHILD_TABLES = [
  ['classroom_post_likes', 'post_id IN (SELECT id FROM classroom_posts WHERE session_id = ANY($1))'],
  ['classroom_post_saves', 'post_id IN (SELECT id FROM classroom_posts WHERE session_id = ANY($1))'],
  ['classroom_comments', 'post_id IN (SELECT id FROM classroom_posts WHERE session_id = ANY($1))'],
  ['classroom_posts', 'session_id = ANY($1)'],
  ['notifications', 'entity_type = \'session\' AND entity_id = ANY($1)'],
  ['mentor_reviews', 'session_id = ANY($1)'],
  ['session_ai_results', 'session_id = ANY($1)'],
  ['ai_results', 'turn_id IN (SELECT id FROM turns WHERE session_id = ANY($1))'],
  ['peer_notes', 'turn_id IN (SELECT id FROM turns WHERE session_id = ANY($1))'],
  ['turns', 'session_id = ANY($1)'],
];

async function findTargetUser(client) {
  if (!email) {
    return null;
  }

  const result = await client.query(
    `SELECT id, display_name, email FROM users WHERE LOWER(email) = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    throw new Error(`Không có tài khoản nào với email ${email}`);
  }

  return result.rows[0];
}

async function findSessions(client, user) {
  if (user) {
    const result = await client.query(
      `
        SELECT id, status, created_at
        FROM sessions
        WHERE user_a_id = $1 OR user_b_id = $1
        ORDER BY created_at
      `,
      [user.id]
    );
    return result.rows;
  }

  const result = await client.query('SELECT id, status, created_at FROM sessions ORDER BY created_at');
  return result.rows;
}

// Xoá dòng trong bảng rồi mới xoá file là sai thứ tự: nếu xoá file trước mà
// giao dịch bị hoãn lại thì database còn trỏ tới bản ghi âm đã mất. Nên lấy
// danh sách file trước, xoá dòng trong một giao dịch, rồi mới gỡ file.
async function collectAudioPaths(client, sessionIds) {
  const result = await client.query(
    `SELECT audio_url FROM turns WHERE session_id = ANY($1) AND audio_url IS NOT NULL`,
    [sessionIds]
  );

  return result.rows
    .map((row) => {
      try {
        return resolveUploadAudioPath(row.audio_url);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function run() {
  const client = await pool.connect();

  try {
    const user = await findTargetUser(client);
    const scope = user
      ? `${user.display_name} <${user.email}>`
      : 'TOÀN BỘ người dùng (không truyền --email)';

    const sessions = await findSessions(client, user);
    console.log(`Phạm vi: ${scope}`);
    console.log(`Số phiên sẽ xoá: ${sessions.length}`);

    if (sessions.length === 0) {
      console.log('Không có gì để xoá.');
      return;
    }

    const byStatus = sessions.reduce((counts, session) => {
      counts[session.status] = (counts[session.status] || 0) + 1;
      return counts;
    }, {});
    for (const [status, count] of Object.entries(byStatus)) {
      console.log(`  ${status}: ${count}`);
    }

    const sessionIds = sessions.map((session) => session.id);
    const audioPaths = await collectAudioPaths(client, sessionIds);
    console.log(`Số bản ghi âm sẽ xoá khỏi ổ đĩa: ${audioPaths.length}`);

    if (!confirmed) {
      console.log('\nĐây chỉ là xem trước. Thêm --yes để thật sự xoá.');
      return;
    }

    await client.query('BEGIN');

    for (const [table, condition] of CHILD_TABLES) {
      const result = await client.query(`DELETE FROM ${table} WHERE ${condition}`, [sessionIds]);
      if (result.rowCount > 0) {
        console.log(`  ${table}: xoá ${result.rowCount} dòng`);
      }
    }

    // Phiên mentor trỏ tới phiên luyện; gỡ liên kết chứ không xoá buổi mentor.
    await client.query(
      `UPDATE mentor_sessions SET session_id = NULL WHERE session_id = ANY($1)`,
      [sessionIds]
    );

    const deleted = await client.query('DELETE FROM sessions WHERE id = ANY($1)', [sessionIds]);
    console.log(`  sessions: xoá ${deleted.rowCount} dòng`);

    await client.query('COMMIT');

    // Ngoài giao dịch, và lỗi ở đây không được làm chết cả lệnh: dòng trong
    // database đã xoá xong rồi. File còn sót chỉ là rác chiếm chỗ, không phải
    // dữ liệu hỏng — báo ra để dọn tay là đủ.
    let removedFiles = 0;
    for (const path of audioPaths) {
      try {
        await unlink(path);
        removedFiles += 1;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn(`  không xoá được ${path}: ${err.message}`);
        }
      }
    }
    console.log(`  bản ghi âm: xoá ${removedFiles}/${audioPaths.length} file`);

    console.log('\nĐã xoá lịch sử luyện tập. Tài khoản, quyền và bộ câu hỏi giữ nguyên.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Xoá lịch sử thất bại:', err.message);
  process.exit(1);
});
