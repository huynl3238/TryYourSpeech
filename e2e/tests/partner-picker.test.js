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

// Chế độ "Lựa chọn ghép cặp" nhìn từ phía người dùng thật: hai trình duyệt riêng,
// bấm qua đúng giao diện, không gọi socket trực tiếp.
//
// Test backend đã phủ phần logic tranh giành (mời chéo, hai người cùng mời một
// người, hết hạn). Ở đây kiểm thứ chúng không với tới được: danh sách có hiện ra
// đúng người không, nút Mời có chạy không, và đồng ý xong có thật sự vào phiên
// bằng đúng luồng cũ hay không.

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

async function enterQueue(person, { random = false } = {}) {
  await person.page.goto(APP_URL);
  await person.page.waitForSelector('#find-partner-btn', { timeout: 30000 });
  if (random) {
    await person.page.click('#mode-random-btn');
  }
  await person.page.click('#find-partner-btn');
  // Chờ 'waiting' HOẶC 'matched': ở chế độ ngẫu nhiên, nếu đã có người phù hợp
  // đang chờ thì được ghép ngay và 'waiting' không bao giờ tới.
  await waitUntil(() => person.hasEvent('waiting') || person.hasEvent('matched'), {
    label: 'vào hàng chờ hoặc được ghép ngay',
  });
}

// Hàng đợi nằm trong bộ nhớ của server và sống qua cả bài test. Không đóng trình
// duyệt sau mỗi bài thì người của bài trước vẫn đang chờ, và bài sau thấy một
// danh sách lẽ ra phải rỗng.
async function twoLearners(t, bandA, bandB) {
  const stamp = Date.now() % 100000;
  const userA = await createTestUser(`Pick A ${stamp}`, bandA);
  const userB = await createTestUser(`Pick B ${stamp}`, bandB);
  createdUserIds.push(userA.id, userB.id);

  const a = await openAs(browser, userA);
  const b = await openAs(browser, userB);

  t.after(async () => {
    await a.context.close();
    await b.context.close();
  });

  return { a, b };
}

test('mời từ danh sách rồi đồng ý thì cả hai vào cùng một phiên', async (t) => {
  const { a, b } = await twoLearners(t, 6, 6.5);

  // B vào trước để A nhìn thấy B trong danh sách.
  await enterQueue(b);
  await enterQueue(a);

  // Danh sách phải hiện tên và band thật, không phải chỗ trống.
  await a.page.waitForSelector(`text=${b.user.displayName}`, { timeout: 20000 });
  await a.page.waitForSelector('text=Band 6.5', { timeout: 10000 });

  // Không ai bị ghép tự động: đây là chế độ tự chọn.
  assert.equal(a.hasEvent('matched'), false, 'chưa mời mà đã ghép là sai');
  assert.equal(b.hasEvent('matched'), false);

  const inviteButton = a.page
    .locator('li', { hasText: b.user.displayName })
    .getByRole('button', { name: 'Mời' });
  await inviteButton.click();

  await waitUntil(() => b.hasEvent('invite_received'), { label: 'B nhận được lời mời' });
  await b.page.waitForSelector(`text=${a.user.displayName}`, { timeout: 10000 });

  await b.page.getByRole('button', { name: 'Đồng ý' }).click();

  // Kết thúc bằng đúng sự kiện `matched` của luồng cũ, nên mọi thứ phía sau
  // (kiểm tra thiết bị, WebRTC, review, AI) không phải sửa gì.
  for (const person of [a, b]) {
    await waitUntil(() => person.hasEvent('matched'), {
      timeoutMs: 30000,
      label: 'vào phiên sau khi đồng ý',
    });
    await person.page.waitForURL('**/device-check', { timeout: 30000 });
  }

  const sessions = await pool.query(
    'SELECT id, status FROM sessions WHERE user_a_id = ANY($1) AND user_b_id = ANY($1)',
    [[a.user.id, b.user.id]]
  );
  assert.equal(sessions.rows.length, 1, 'phải tạo đúng một phiên');
  assert.equal(sessions.rows[0].status, 'matched');
});

test('từ chối thì không ai vào phiên và người mời được báo', async (t) => {
  const { a, b } = await twoLearners(t, 6, 6);

  await enterQueue(b);
  await enterQueue(a);
  await a.page.waitForSelector(`text=${b.user.displayName}`, { timeout: 20000 });

  await a.page
    .locator('li', { hasText: b.user.displayName })
    .getByRole('button', { name: 'Mời' })
    .click();

  await waitUntil(() => b.hasEvent('invite_received'), { label: 'B nhận lời mời' });
  await b.page.getByRole('button', { name: 'Từ chối' }).click();

  await waitUntil(() => a.hasEvent('invite_declined'), { label: 'A biết mình bị từ chối' });

  // Người bị từ chối được báo bằng một câu trung lập, không ai bị nói là bị chê.
  await a.page.waitForSelector('text=chưa nhận lời mời', { timeout: 10000 });
  assert.equal(a.hasEvent('matched'), false);
  assert.equal(b.hasEvent('matched'), false);
});

test('người đang tự chọn không bị ghép ngẫu nhiên kéo đi', async (t) => {
  const { a, b } = await twoLearners(t, 6, 6);

  // A tự chọn, B ghép ngẫu nhiên. Cùng band nên thừa sức ghép nếu luật cho phép.
  await enterQueue(a);
  await enterQueue(b, { random: true });

  await a.page.waitForSelector(`text=${b.user.displayName}`, { timeout: 20000 });

  // B hiện trong danh sách nhưng có ghi chú, để A biết người này có thể biến mất.
  await a.page.waitForSelector('text=đang tìm ghép nhanh', { timeout: 10000 });

  assert.equal(a.hasEvent('matched'), false, 'A đang đọc danh sách, không được bị ghép');
  assert.equal(b.hasEvent('matched'), false, 'không có ai khác ở chế độ ngẫu nhiên');
});

test('chờ lâu thì có đường thoát sang ghép ngẫu nhiên', async (t) => {
  const { a, b } = await twoLearners(t, 6, 6);

  await enterQueue(a);

  // Cố ý KHÔNG khẳng định danh sách rỗng: hàng đợi nằm trong bộ nhớ server và
  // dùng chung cho cả tiến trình, nên người của bài khác có thể còn sót lại.
  // Điều bài này nói tới là lối thoát, và nó phải hiện ra dù danh sách có ai hay
  // không — rỗng thì hiện ngay, có người thì sau 20 giây.
  await a.page.waitForSelector('text=Chuyển sang ghép ngẫu nhiên', { timeout: 30000 });
  await a.page.getByRole('button', { name: 'Chuyển sang ghép ngẫu nhiên' }).click();
  await waitUntil(() => a.hasEvent('match_mode'), { label: 'A đổi sang ghép ngẫu nhiên' });

  // Và từ lúc đó A ghép được với người vào sau ở chế độ ngẫu nhiên.
  await enterQueue(b, { random: true });

  for (const person of [a, b]) {
    await waitUntil(() => person.hasEvent('matched'), {
      timeoutMs: 30000,
      label: 'ghép được sau khi chuyển chế độ',
    });
  }
});
