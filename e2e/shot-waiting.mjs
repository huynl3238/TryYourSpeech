// Chup man hinh CHO GHEP CAP o tung trang thai, di dung duong nguoi dung that:
// mo trang, bam "Bat dau ghep", roi de server tu day danh sach xuong.
//
// Nam trang thai, vi moi cai trong ra mot kieu khac va de bo sot khi chi xem mot:
//   1. Danh sach day du ba nhom band
//   2. Co loi moi den (co vong dem nguoc)
//   3. Dang cho nguoi khac tra loi loi moi minh gui
//   4. Hang doi rong (khung xuong + vet sang chay)
//   5. Che do ghep ngau nhien
//
// Chay tu e2e/: node shot-waiting.mjs <thu-muc-anh>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_URL,
  createTestUser,
  deleteTestUsers,
  launchBrowser,
  openAs,
  pool,
  requireDevServers,
  waitUntil,
} from './helpers/harness.js';

const outDir = process.argv[2];
if (!outDir) {
  console.error('Thieu thu muc anh. Vi du: node shot-waiting.mjs ../anh-man-cho');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const problems = await requireDevServers();
if (problems.length > 0) {
  console.error('Chua chay duoc:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

const stamp = Date.now() % 100000;
const createdUserIds = [];
const browser = await launchBrowser();

async function person(name, band) {
  const user = await createTestUser(name, band);
  createdUserIds.push(user.id);
  const opened = await openAs(browser, user);
  // Rong hon mac dinh de bat het khung, x2 cho anh net khi dua vao bao cao.
  await opened.page.setViewportSize({ width: 1280, height: 1000 });
  return opened;
}

async function enterQueue(who, { random = false } = {}) {
  await who.page.goto(APP_URL);
  await who.page.waitForSelector('#find-partner-btn', { timeout: 30000 });
  if (random) await who.page.click('#mode-random-btn');
  await who.page.click('#find-partner-btn');
  await waitUntil(() => who.hasEvent('waiting') || who.hasEvent('matched'), {
    label: `${who.user.displayName} vao hang cho`,
  });
}

async function shoot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log('da chup:', path);
}

try {
  // Ba band khac nhau de danh sach co du ca ba nhom: tuong duong, cao hon, thap hon.
  const me = await person(`Huy ${stamp}`, 6);
  const same = await person(`Trà My ${stamp}`, 6);
  const higher = await person(`Minh Anh ${stamp}`, 7.5);
  const lower = await person(`Bảo ${stamp}`, 5);

  for (const other of [same, higher, lower]) {
    await enterQueue(other);
  }
  await enterQueue(me);

  await me.page.waitForSelector(`text=${higher.user.displayName}`, { timeout: 20000 });
  // Cho dong ho "Da cho" nhay vai giay de anh khong phai 0:00.
  await me.page.waitForTimeout(4000);
  await shoot(me.page, '1-danh-sach-chon-ban');

  // 2. Loi moi den: nguoi band cao hon moi minh.
  await higher.page
    .locator('li', { hasText: me.user.displayName })
    .getByRole('button', { name: 'Mời' })
    .click();
  await waitUntil(() => me.hasEvent('invite_received'), { label: 'nhan duoc loi moi' });
  // Cho vai giay de vong dem nguoc khuyet di mot goc, nhin ra la dang chay.
  await me.page.waitForTimeout(5000);
  await shoot(me.page, '2-loi-moi-den');

  await me.page.getByRole('button', { name: 'Từ chối' }).click();
  await me.page.waitForTimeout(1200);

  // 3. Minh gui loi moi va dang cho tra loi.
  await me.page
    .locator('li', { hasText: same.user.displayName })
    .getByRole('button', { name: 'Mời' })
    .click();
  await waitUntil(() => same.hasEvent('invite_received'), { label: 'ben kia nhan loi moi' });
  await me.page.waitForTimeout(4000);
  await shoot(me.page, '3-dang-cho-tra-loi');

  // 4. Hang doi rong. Dong ba nguoi kia lai, server tu day danh sach moi xuong.
  for (const other of [same, higher, lower]) {
    await other.context.close();
  }
  await me.page.waitForSelector('text=Chưa có ai đang chờ', { timeout: 30000 });
  await me.page.waitForTimeout(1500);
  await shoot(me.page, '4-chua-co-ai-dang-cho');

  // 5. Che do ghep ngau nhien.
  await me.page.getByRole('button', { name: 'Chuyển sang ghép ngẫu nhiên' }).click();
  await waitUntil(() => me.hasEvent('match_mode'), { label: 'doi sang ghep ngau nhien' });
  await me.page.waitForTimeout(2500);
  await shoot(me.page, '5-ghep-ngau-nhien');
} catch (err) {
  console.error('LOI:', err.message);
} finally {
  await browser.close();
  await deleteTestUsers(createdUserIds);
  await pool.end();
}
