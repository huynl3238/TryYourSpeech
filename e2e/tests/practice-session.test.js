import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import {
  APP_URL,
  createTestUser,
  delay,
  deleteTestUsers,
  getSessionStatus,
  launchBrowser,
  openAs,
  pool,
  readAudioStats,
  requireDevServers,
  waitUntil,
} from '../helpers/harness.js';

// Kiểm thử hai người luyện thật, mỗi người một trình duyệt riêng.
//
// Vì sao cần: tính tới 08/08/2026, 8/8 phiên trên server thật đều `abandoned`,
// chưa một phiên nào hoàn thành. Nghi vấn chính là offer WebRTC bị đánh rơi. Bộ
// test tự động của backend không chạm tới được chỗ đó — nó chỉ giả lập socket,
// không có RTCPeerConnection thật nào được tạo.
//
// Cái test này KHÔNG thay được người: micro giả của Chromium phát tiếng bíp tổng
// hợp nên không kiểm được nghe có rõ không, và chặng AI chấm điểm thì phiên âm
// tiếng bíp ra rỗng. Nó trả lời đúng một câu, nhưng là câu đang bỏ ngỏ: hai máy
// có nối được với nhau và audio có chảy qua cả hai chiều hay không.

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

async function twoLearners(band = 6) {
  const userA = await createTestUser(`E2E A ${Date.now() % 100000}`, band);
  const userB = await createTestUser(`E2E B ${Date.now() % 100000}`, band);
  createdUserIds.push(userA.id, userB.id);

  const a = await openAs(browser, userA);
  const b = await openAs(browser, userB);

  return { a, b };
}

// Đưa hai người từ trang chủ tới lúc đang luyện. Bấm qua giao diện thật chứ không
// gọi socket trực tiếp — mục đích là kiểm cả đường đi của giao diện.
async function matchAndConnect(a, b) {
  for (const person of [a, b]) {
    await person.page.goto(APP_URL);
    await person.page.waitForSelector('#find-partner-btn', { timeout: 30000 });
  }

  await a.page.click('#find-partner-btn');
  await waitUntil(() => a.hasEvent('waiting'), { label: 'A vào hàng chờ' });
  await b.page.click('#find-partner-btn');

  // Cả hai phải nhận 'matched' và sang màn kiểm tra thiết bị.
  for (const person of [a, b]) {
    await waitUntil(() => person.hasEvent('matched'), { label: 'nhận được matched' });
    await person.page.waitForURL('**/device-check', { timeout: 30000 });
    await person.page.waitForSelector('#ready-btn:not([disabled])', { timeout: 45000 });
  }

  await a.page.click('#ready-btn');
  await b.page.click('#ready-btn');
}

async function currentSessionId() {
  const result = await pool.query(
    `SELECT id FROM sessions WHERE room_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`
  );
  return result.rows[0]?.id || null;
}

test('hai người ghép được, nối WebRTC và audio chảy qua cả hai chiều', async (t) => {
  const { a, b } = await twoLearners();

  await matchAndConnect(a, b);

  // begin_signaling rồi mới tới session_start. Nếu offer bị đánh rơi thì
  // session_start không bao giờ tới và 45 giây sau sẽ là 'webrtc_failed' — đúng
  // dấu vết của 8 phiên abandoned trên server thật.
  for (const person of [a, b]) {
    await waitUntil(() => person.hasEvent('begin_signaling'), { label: 'begin_signaling' });
  }

  for (const person of [a, b]) {
    await waitUntil(() => person.hasEvent('session_start'), {
      timeoutMs: 60000,
      label: 'session_start (nếu hết giờ ở đây thì offer/answer đã hỏng)',
    });
  }

  assert.equal(
    a.hasEvent('webrtc_failed'),
    false,
    'không được có webrtc_failed'
  );

  const sessionId = await currentSessionId();
  assert.equal(await getSessionStatus(sessionId), 'active', 'phiên phải chuyển sang active');

  // Cho media chạy vài giây rồi mới đo, vì byte đầu tiên không tới ngay.
  await delay(6000);

  const statsA = await readAudioStats(a.page);
  const statsB = await readAudioStats(b.page);

  assert.equal(statsA.connectionState, 'connected', `A: ${JSON.stringify(statsA)}`);
  assert.equal(statsB.connectionState, 'connected', `B: ${JSON.stringify(statsB)}`);

  // Đây là phần quan trọng nhất của cả file. Kiểm CẢ HAI chiều: nếu chỉ một bên
  // nhận được audio thì đó đúng là lỗi answer chỉ-nhận-không-gửi, tức offer đã
  // được xử lý trước khi micro được gắn vào kết nối.
  assert.ok(statsA.bytesReceived > 0, `A phải nhận được audio, thực tế: ${JSON.stringify(statsA)}`);
  assert.ok(statsB.bytesReceived > 0, `B phải nhận được audio, thực tế: ${JSON.stringify(statsB)}`);
  assert.ok(statsA.bytesSent > 0, `A phải gửi được audio, thực tế: ${JSON.stringify(statsA)}`);
  assert.ok(statsB.bytesSent > 0, `B phải gửi được audio, thực tế: ${JSON.stringify(statsB)}`);

  t.diagnostic(`A nhận ${statsA.bytesReceived} byte / ${statsA.packetsReceived} gói`);
  t.diagnostic(`B nhận ${statsB.bytesReceived} byte / ${statsB.packetsReceived} gói`);
});

test('mất mạng vài giây thì phiên vẫn sống, không bị đánh abandoned', async (t) => {
  const { a, b } = await twoLearners();
  await matchAndConnect(a, b);

  for (const person of [a, b]) {
    await waitUntil(() => person.hasEvent('session_start'), {
      timeoutMs: 60000,
      label: 'session_start',
    });
  }

  const sessionId = await currentSessionId();

  // Ngắt mạng của A. Khác hẳn việc đóng tab: đóng tab thì socket đóng tử tế và
  // server biết ngay, còn mất mạng thì không ai nói gì cả — server chỉ phát hiện
  // qua nhịp tim, mà mặc định của Socket.IO là 25s nhịp + 20s chờ, tức tới 45s.
  // Chờ 90s ở đây là để ĐO độ trễ đó, không phải để coi nó là chấp nhận được.
  // setOffline chặn HTTP và WebSocket, nhưng ĐO THẬT cho thấy nó KHÔNG chặn
  // đường media WebRTC khi hai bên cùng một máy: B vẫn nhận audio đều đặn suốt
  // 30 giây sau đó. Nên đây đúng là tình huống "đứt đường tới server nhưng cuộc
  // gọi vẫn tốt" — chính là tình huống mà 15 giây ân hạn được làm ra để cứu.
  //
  // Vì cuộc gọi vẫn chạy, ở đây KHÔNG kỳ vọng dải băng hiện ra. Việc phát hiện
  // media chết được kiểm ở bài dưới.
  const offlineAt = Date.now();
  await a.context.setOffline(true);

  // Socket.IO chỉ nhận ra qua nhịp tim: mặc định 25s nhịp + 20s chờ.
  await waitUntil(() => b.hasEvent('partner_reconnecting'), {
    timeoutMs: 90000,
    label: 'server nhận ra và giữ phòng lại',
  });
  t.diagnostic(`server nhận ra sau ${Math.round((Date.now() - offlineAt) / 1000)}s`);

  await delay(5000);
  await a.context.setOffline(false);

  await waitUntil(() => a.hasEvent('session_resumed'), {
    timeoutMs: 40000,
    label: 'A được đưa lại vào phòng cũ',
  });
  await waitUntil(() => b.hasEvent('partner_reconnected'), {
    timeoutMs: 20000,
    label: 'B được báo đối tác đã nối lại',
  });

  // Trước bản vá 08/08, một cú rớt mạng như trên là mất cả phiên.
  assert.notEqual(await getSessionStatus(sessionId), 'abandoned');
  assert.equal(b.hasEvent('partner_disconnected'), false, 'không được báo ngắt kết nối');
});

test('media của đối tác chết thì được báo ngay, không phải chờ nhịp tim server', async (t) => {
  const { a, b } = await twoLearners();
  await matchAndConnect(a, b);

  for (const person of [a, b]) {
    await waitUntil(() => person.hasEvent('session_start'), {
      timeoutMs: 60000,
      label: 'session_start',
    });
  }
  await delay(3000);

  // Đóng thẳng kết nối media của A. Đây là thứ mà một cú rớt wifi thật gây ra và
  // setOffline không mô phỏng được: tiếng và hình ngừng chảy. Server thì vẫn thấy
  // socket của A sống nhăn, nên nếu B được báo thì chỉ có thể là B tự phát hiện.
  const brokenAt = Date.now();
  await a.page.evaluate(() => window.__tysPeerConnection.close());

  await b.page.waitForSelector('text=Đối tác đang kết nối lại', { timeout: 30000 });
  const seconds = Math.round((Date.now() - brokenAt) / 1000);
  t.diagnostic(`B tự phát hiện sau ${seconds}s`);

  // Không có mốc nào dựa vào server ở đây: socket của A chưa hề đứt.
  assert.equal(b.hasEvent('partner_reconnecting'), false, 'server chưa thể biết');
  assert.ok(seconds <= 20, `phải phát hiện trong 20s, thực tế ${seconds}s`);
});

test('đóng tab hẳn thì bên kia chỉ được báo ngắt sau khi hết ân hạn', async () => {
  const { a, b } = await twoLearners();
  await matchAndConnect(a, b);

  for (const person of [a, b]) {
    await waitUntil(() => person.hasEvent('session_start'), {
      timeoutMs: 60000,
      label: 'session_start',
    });
  }

  const closedAt = Date.now();
  await a.context.close();

  await waitUntil(() => b.hasEvent('partner_reconnecting'), {
    timeoutMs: 20000,
    label: 'B được báo đang chờ nối lại trước',
  });

  await waitUntil(() => b.hasEvent('partner_disconnected'), {
    timeoutMs: 40000,
    label: 'B được báo ngắt kết nối sau ân hạn',
  });

  const waited = Date.now() - closedAt;
  assert.ok(
    waited >= 14000,
    `phải chờ đủ 15 giây ân hạn trước khi báo ngắt, thực tế chỉ ${Math.round(waited / 1000)} giây`
  );
});
