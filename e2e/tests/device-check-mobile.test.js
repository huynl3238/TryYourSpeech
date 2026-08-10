import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import {
  APP_URL,
  createTestUser,
  deleteTestUsers,
  launchBrowser,
  openAs,
  pool,
  requireDevServers,
  waitUntil,
} from '../helpers/harness.js';

// Màn "Kiểm tra thiết bị" trên điện thoại.
//
// Bản trước dùng `grid-cols-[1fr_300px]` không có điểm ngắt nào. Trên iPhone rộng
// 390px, cột phải chiếm cứng 300px nên cột trái còn vài chục pixel: video bị bóp
// dẹt và chữ "Microphone" bị ngắt xuống từng ký tự, thành một dải trắng cao ngoằng.
//
// CHÚ Ý khi sửa mấy bài này: lỗi đó KHÔNG gây tràn ngang — nội dung vẫn nằm trong
// khung, chỉ bị nén. Nên phép đo duy nhất có ý nghĩa là CHIỀU RỘNG THẬT của video,
// không phải scrollWidth. Một bài test chỉ kiểm tràn ngang sẽ xanh trong khi lỗi
// còn nguyên.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

let browser = null;
const createdUserIds = [];

before(async () => {
  const problems = await requireDevServers();
  if (problems.length > 0) {
    throw new Error('Chưa chạy được:\n  - ' + problems.join('\n  - '));
  }

  browser = await launchBrowser();
});

after(async () => {
  if (browser) await browser.close();
  await deleteTestUsers(createdUserIds);
  await pool.end();
});

// Ghép hai người thật rồi dừng ở màn kiểm tra thiết bị.
async function matchedPair(t) {
  const stamp = Date.now() % 100000;
  const userA = await createTestUser(`Dev A ${stamp}`, 6);
  const userB = await createTestUser(`Dev B ${stamp}`, 6);
  createdUserIds.push(userA.id, userB.id);

  const a = await openAs(browser, userA);
  const b = await openAs(browser, userB);

  t.after(async () => {
    await a.context.close();
    await b.context.close();
  });

  for (const person of [a, b]) {
    await person.page.goto(APP_URL);
    await person.page.waitForSelector('#find-partner-btn', { timeout: 30000 });
    await person.page.click('#mode-random-btn');
    await person.page.click('#find-partner-btn');
  }

  for (const person of [a, b]) {
    await waitUntil(() => person.hasEvent('matched'), {
      timeoutMs: 30000,
      label: `${person.user.displayName} được ghép`,
    });
    await person.page.waitForURL('**/device-check', { timeout: 30000 });
  }

  await a.page.waitForSelector('#ready-btn:not([disabled])', { timeout: 40000 });
  return a;
}

test('trên điện thoại, video chiếm gần hết chiều rộng thay vì bị bóp dẹt', async (t) => {
  const person = await matchedPair(t);

  await person.page.setViewportSize(PHONE);
  await person.page.waitForTimeout(600);

  const video = await person.page.locator('video').first().boundingBox();
  assert.ok(video, 'không tìm thấy khung video');

  // Bố cục một cột thì video rộng gần bằng màn hình (trừ padding hai bên).
  // Bố cục hai cột cứng thì con số này rơi xuống khoảng vài chục pixel.
  assert.ok(
    video.width > PHONE.width * 0.8,
    `video chỉ rộng ${Math.round(video.width)}px trên màn ${PHONE.width}px — đang bị bóp`
  );

  // Và nó phải giữ đúng tỉ lệ 16:9, không bị kéo thành cột dọc.
  const ratio = video.width / video.height;
  assert.ok(
    ratio > 1.4 && ratio < 2.1,
    `tỉ lệ video là ${ratio.toFixed(2)}, lẽ ra khoảng 1.78 (16:9)`
  );
});

test('nút Sẵn sàng trải hết chiều rộng và nằm trong khung nhìn', async (t) => {
  const person = await matchedPair(t);

  await person.page.setViewportSize(PHONE);
  await person.page.waitForTimeout(600);

  const button = await person.page.locator('#ready-btn').boundingBox();
  assert.ok(button, 'không tìm thấy nút Sẵn sàng');
  assert.ok(
    button.width > PHONE.width * 0.8,
    `nút chỉ rộng ${Math.round(button.width)}px trên màn ${PHONE.width}px`
  );
  assert.ok(
    button.x >= 0 && button.x + button.width <= PHONE.width + 1,
    'nút bị tràn ra ngoài khung nhìn'
  );
});

test('dòng trạng thái Microphone và Camera không bị ngắt chữ', async (t) => {
  const person = await matchedPair(t);

  await person.page.setViewportSize(PHONE);
  await person.page.waitForTimeout(600);

  // Chữ bị ngắt xuống từng ký tự thì khung của nó cao vọt lên. Một dòng chữ 14px
  // cao khoảng 20px; đặt ngưỡng 40px để còn dư cho việc xuống hai hàng bình thường.
  for (const label of ['Microphone', 'Camera']) {
    const box = await person.page.locator(`text=${label}`).first().boundingBox();
    assert.ok(box, `không tìm thấy nhãn ${label}`);
    assert.ok(
      box.height < 40,
      `nhãn ${label} cao ${Math.round(box.height)}px — chữ đang bị ngắt dọc`
    );
  }
});

test('trên máy tính vẫn là hai cột, không bị đổi thành một cột', async (t) => {
  const person = await matchedPair(t);

  await person.page.setViewportSize(DESKTOP);
  await person.page.waitForTimeout(600);

  const video = await person.page.locator('video').first().boundingBox();
  const button = await person.page.locator('#ready-btn').boundingBox();

  // Hai cột nghĩa là nút Sẵn sàng nằm BÊN PHẢI video, không phải bên dưới.
  assert.ok(
    button.x > video.x + video.width - 1,
    'trên máy tính nút Sẵn sàng phải nằm bên phải khung video'
  );
});
