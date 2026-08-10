// Chup man KIEM TRA THIET BI (nut "Toi da san sang") o kho dien thoai.
//
// Phai ghep cap that moi toi duoc man nay, nen mo hai trinh duyet nhu bo e2e.
// Chup ba kho de thay ro diem ngat: iPhone hep, iPhone thuong, va may tinh.
//
// Chay tu e2e/: node shot-device-check.mjs <thu-muc-anh>
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
  console.error('Dung: node shot-device-check.mjs <thu-muc-anh>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const problems = await requireDevServers();
if (problems.length > 0) {
  console.error('Chua chay duoc:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

// iPhone SE la kho hep nhat con dung nhieu; 390 la iPhone 12-15 thuong.
const VIEWPORTS = [
  { name: '1-iphone-se-375', width: 375, height: 812 },
  { name: '2-iphone-390', width: 390, height: 844 },
  { name: '3-may-tinh-1280', width: 1280, height: 900 },
];

const browser = await launchBrowser();
const created = [];

async function enterQueue(who) {
  await who.page.goto(APP_URL);
  await who.page.waitForSelector('#find-partner-btn', { timeout: 30000 });
  await who.page.click('#mode-random-btn');
  await who.page.click('#find-partner-btn');
}

try {
  const stamp = Date.now() % 100000;
  const userA = await createTestUser(`Huy ${stamp}`, 6);
  const userB = await createTestUser(`Tra My ${stamp}`, 6);
  created.push(userA.id, userB.id);

  const a = await openAs(browser, userA);
  const b = await openAs(browser, userB);

  await enterQueue(a);
  await enterQueue(b);

  for (const person of [a, b]) {
    await waitUntil(() => person.hasEvent('matched'), {
      timeoutMs: 30000,
      label: `${person.user.displayName} duoc ghep`,
    });
    await person.page.waitForURL('**/device-check', { timeout: 30000 });
  }

  // Cho nut San sang bat len (can camera/mic gia va du lieu phien tai xong).
  await a.page.waitForSelector('#ready-btn:not([disabled])', { timeout: 40000 });

  for (const vp of VIEWPORTS) {
    await a.page.setViewportSize({ width: vp.width, height: vp.height });
    await a.page.waitForTimeout(900);

    const path = join(outDir, `${vp.name}.png`);
    await a.page.screenshot({ path, fullPage: true });

    // Do luon xem trang co bi tran ngang khong — mat thuong de bo qua.
    const overflow = await a.page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    const tran = overflow.scroll > overflow.client + 1;
    console.log(
      `${vp.name.padEnd(22)} ${vp.width}px  ${tran ? 'TRAN NGANG' : 'khong tran'}`
      + `  (scroll ${overflow.scroll} / khung ${overflow.client})`
    );
  }
} catch (err) {
  console.error('LOI:', err.message);
} finally {
  await browser.close();
  await deleteTestUsers(created);
  await pool.end();
}
