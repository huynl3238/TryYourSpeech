// Chup man hinh KET QUA that ma nguoi dung nhin thay.
//
// Di dung duong nguoi dung quay lai xem sau: Lich su luyen tap -> bam vao phien.
// ResultsPage doc du lieu tu bo nho trong React, nen vao thang URL /results se
// trong — duong qua Lich su moi la duong that.
//
// Chay: node shot-results.mjs <file-json-co-token> <thu-muc-anh>
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [sessionFile, outDir] = process.argv.slice(2);
const APP_URL = process.env.E2E_APP_URL || 'http://localhost:5173';
const session = JSON.parse(readFileSync(sessionFile, 'utf8'));

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  // Rong hon mac dinh de bat het cot ben phai; deviceScaleFactor 2 cho anh net khi
  // dua vao bao cao.
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
});

await context.addCookies([
  {
    name: 'tys_access',
    value: session.token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  },
]);

const page = await context.newPage();

async function shoot(name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log('da chup:', path);
}

try {
  await page.goto(APP_URL);
  await page.waitForSelector('#find-partner-btn', { timeout: 45000 });

  await page.getByRole('button', { name: /Lịch sử luyện tập/ }).first().click();
  await page.waitForSelector('text=Xem lại các phiên đã tham gia', { timeout: 20000 });
  await page.waitForTimeout(2500);
  await shoot('1-lich-su');

  // Bam vao phien vua dung.
  const opener = page
    .getByRole('button')
    .filter({ hasText: /Xem lại|Xem kết quả|Kết quả AI/ })
    .first();

  if ((await opener.count()) > 0) {
    await opener.click();
  } else {
    await page.locator('article').first().click();
  }

  await page.waitForURL('**/results', { timeout: 45000 });
  // Cho ban tom tat holistic hien ra truoc khi chup.
  await page.waitForSelector('text=Điểm 3 tiêu chí IELTS', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await shoot('2-ket-qua-tong-quan');

  // Khu phat am nam duoi cung cua phan tom tat.
  const pron = page.locator('text=Những từ nên luyện lại').first();
  if ((await pron.count()) > 0) {
    await pron.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await shoot('3-phat-am');
  }

  // Bam sang mot luot noi cu the de thay transcript + ghi chu cua nguoi cung luyen.
  const turnTab = page.getByRole('button').filter({ hasText: /Part 2/ }).first();
  if ((await turnTab.count()) > 0) {
    await turnTab.click();
    await page.waitForTimeout(2000);
    await shoot('4-chi-tiet-mot-luot');
  }
} catch (err) {
  console.error('LOI:', err.message);
  await shoot('loi-man-hinh-hien-tai');
} finally {
  await browser.close();
}
