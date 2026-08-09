import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after, before } from 'node:test';
import { chromium } from 'playwright';

// Kiểm bản đang chạy thật tại https://try-your-speech.lehuytramy.site
//
// Khác hẳn bộ test trên localhost: ở đây có HTTPS, Cloudflare, nginx, TURN server,
// và backend là tiến trình PM2 thật đọc .env thật.
//
// Chỉ bám vào GIAO DIỆN, không nghe sự kiện socket. Lý do: `window.__tysSocket`
// và `window.__tysPeerConnection` nằm sau `import.meta.env.DEV` nên Vite loại hẳn
// khỏi bản build — đúng như mong muốn, và cũng có nghĩa là trên production không
// có cửa sau nào để nhìn vào. Cách duy nhất còn lại chính là cách người dùng thấy.
//
// Điều đó vẫn đủ để chứng minh WebRTC hoạt động: server CHỈ phát `session_start`
// sau khi CẢ HAI client báo `peer_connected`, mà client chỉ báo khi
// RTCPeerConnection thật sự vào trạng thái `connected`. Nên việc hai trình duyệt
// cùng sang được màn hình phiên luyện là bằng chứng gián tiếp nhưng chắc chắn.
//
// KHÔNG tự tạo tài khoản: token được ký sẵn TRÊN SERVER bằng .env của server, nên
// JWT_SECRET của production không bao giờ rời khỏi máy đó.

const APP_URL = process.env.E2E_APP_URL || 'https://try-your-speech.lehuytramy.site';
const USERS_FILE = process.env.E2E_USERS;

let browser = null;
let users = [];
const contexts = [];

before(async () => {
  assert.ok(USERS_FILE, 'cần E2E_USERS trỏ tới file json chứa tài khoản đã ký token');
  users = JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
  assert.equal(users.length, 2, 'cần đúng hai tài khoản');

  browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
});

after(async () => {
  for (const context of contexts) {
    await context.close().catch(() => {});
  }
  if (browser) await browser.close();
});

async function openAs(user) {
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  contexts.push(context);

  const url = new URL(APP_URL);
  await context.addCookies([
    {
      name: 'tys_access',
      value: user.token,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);

  return { context, page: await context.newPage(), user };
}

async function startSearching(person, { random = false } = {}) {
  await person.page.goto(APP_URL);
  await person.page.waitForSelector('#find-partner-btn', { timeout: 45000 });
  if (random) {
    await person.page.click('#mode-random-btn');
  }
  await person.page.click('#find-partner-btn');
}

test('bản chạy thật: đăng nhập được và thấy đủ hai chế độ ghép', async () => {
  const a = await openAs(users[0]);
  await a.page.goto(APP_URL);

  // Nút này chỉ hiện khi cookie được chấp nhận và tài khoản tải về được, tức là
  // HTTPS, Cloudflare, nginx và backend đều đang thông.
  await a.page.waitForSelector('#find-partner-btn', { timeout: 45000 });
  await a.page.waitForSelector('#mode-choose-btn', { timeout: 15000 });
  await a.page.waitForSelector('#mode-random-btn', { timeout: 15000 });
});

test('bản chạy thật: mời từ danh sách rồi đồng ý thì cả hai vào phiên', async () => {
  const a = await openAs(users[0]);
  const b = await openAs(users[1]);

  // B vào trước để A nhìn thấy B trong danh sách.
  await startSearching(b);
  await b.page.waitForSelector('text=Chọn bạn luyện', { timeout: 45000 });
  await startSearching(a);
  await a.page.waitForSelector('text=Chọn bạn luyện', { timeout: 45000 });

  // Danh sách hiện tên và band lấy từ database production.
  await a.page.waitForSelector(`text=${users[1].displayName}`, { timeout: 45000 });
  await a.page.waitForSelector('text=Band 6.5', { timeout: 15000 });

  await a.page
    .locator('li', { hasText: users[1].displayName })
    .getByRole('button', { name: 'Mời' })
    .click();

  await b.page.waitForSelector('text=muốn luyện cùng bạn', { timeout: 45000 });
  await b.page.getByRole('button', { name: 'Đồng ý' }).click();

  for (const person of [a, b]) {
    await person.page.waitForURL('**/device-check', { timeout: 45000 });
  }
});

test('bản chạy thật: WebRTC nối được, hai máy cùng vào tới màn luyện', async () => {
  const a = await openAs(users[0]);
  const b = await openAs(users[1]);

  // Ghép ngẫu nhiên cho nhanh — bài này nói về WebRTC, không về cách ghép.
  await startSearching(b, { random: true });
  await startSearching(a, { random: true });

  for (const person of [a, b]) {
    await person.page.waitForURL('**/device-check', { timeout: 60000 });
    await person.page.waitForSelector('#ready-btn:not([disabled])', { timeout: 60000 });
  }

  await a.page.click('#ready-btn');
  await b.page.click('#ready-btn');

  // Đây là chỗ 8/8 phiên trên production từng chết: offer bị đánh rơi thì
  // session_start không bao giờ tới, 45 giây sau là màn hình webrtc_failed và
  // phiên bị đánh abandoned.
  for (const person of [a, b]) {
    await person.page.waitForURL('**/session', { timeout: 90000 });
  }

  // Và không bên nào rơi vào màn hình lỗi kết nối.
  for (const person of [a, b]) {
    assert.equal(
      await person.page.locator('text=Không thiết lập được kết nối').count(),
      0,
      'không được có màn hình webrtc_failed'
    );
  }
});
