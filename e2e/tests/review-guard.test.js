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
} from '../helpers/harness.js';

// Bước nhận xét giữ toàn bộ dữ liệu trong bộ nhớ của tab: ghi chú vừa đánh dấu và
// ghi âm các lượt mình nói. Tải lại trang hoặc mở thẳng /review là mất sạch.
//
// Bản trước vẫn dựng nguyên giao diện trong tình huống đó: danh sách lượt rỗng,
// badge xanh "Đã tải audio", và nút "Hoàn tất review" BẤM ĐƯỢC — bấm vào thì gọi
// completeReview với sessionId null, thất bại im lặng, rồi vẫn nhảy sang màn chờ
// AI và người dùng ngồi đó mãi.
//
// Mở thẳng /review đúng là tình huống cần kiểm: không có state trong bộ nhớ, y như
// sau khi bấm F5.

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

async function openReviewDirectly(t) {
  const user = await createTestUser(`Review ${Date.now() % 100000}`, 6);
  createdUserIds.push(user.id);

  const person = await openAs(browser, user);
  t.after(async () => {
    await person.context.close();
  });

  await person.page.goto(`${APP_URL}/review`);
  return person;
}

test('mở thẳng trang nhận xét thì được báo mất dữ liệu, không phải màn hình rỗng', async (t) => {
  const person = await openReviewDirectly(t);

  await person.page.waitForSelector('text=Không còn dữ liệu của phiên luyện này', {
    timeout: 20000,
  });

  // Phải nói rõ vì sao mất, chứ không chỉ báo "có lỗi".
  await person.page.waitForSelector('text=chỉ giữ dữ liệu trong tab đang mở', { timeout: 10000 });
});

test('không còn nút Hoàn tất review để bấm vào chỗ trống', async (t) => {
  const person = await openReviewDirectly(t);
  await person.page.waitForSelector('text=Không còn dữ liệu của phiên luyện này', {
    timeout: 20000,
  });

  // Đây là hạt nhân của lỗi: nút này từng bấm được và đẩy người dùng sang màn chờ
  // AI vĩnh viễn.
  assert.equal(
    await person.page.locator('#complete-review-btn').count(),
    0,
    'nút Hoàn tất review vẫn còn khi không có phiên nào'
  );
  assert.equal(
    await person.page.getByRole('button', { name: /Hoàn tất review/ }).count(),
    0
  );
});

test('không hiện badge "Đã tải audio" khi chẳng có audio nào', async (t) => {
  const person = await openReviewDirectly(t);
  await person.page.waitForSelector('text=Không còn dữ liệu của phiên luyện này', {
    timeout: 20000,
  });

  // Badge xanh này là chỗ dễ tin nhất mà lại sai nhất: nó xanh vì danh sách lượt
  // rỗng nên "không còn gì đang chờ tải".
  assert.equal(await person.page.locator('text=Đã tải audio').count(), 0);
  // Và cũng không được hiện tên đối tác rỗng.
  assert.equal(await person.page.locator('text=undefined').count(), 0);
});

test('có đường về trang chủ và nó dẫn về đúng chỗ', async (t) => {
  const person = await openReviewDirectly(t);
  await person.page.waitForSelector('text=Không còn dữ liệu của phiên luyện này', {
    timeout: 20000,
  });

  await person.page.getByRole('button', { name: 'Về trang chủ' }).click();

  // Về tới màn ghép cặp thật, không phải một trang trắng khác.
  await person.page.waitForSelector('#find-partner-btn', { timeout: 20000 });
});
