import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';

// Ngắn để xem lời mời tự hết hạn mà không phải chờ 30 giây thật.
process.env.SOCKET_INVITE_TIMEOUT_MS = '600';

import { setupSocket } from '../src/socket/index.js';

// Chế độ "Lựa chọn ghép cặp": hai người cùng ở trong hàng chờ, tự nhìn thấy nhau
// và mời nhau. Phần dễ sai nhất không phải việc mời, mà là ba tình huống giành
// nhau — hai người cùng mời một người, mời chéo nhau, và máy ghép ngẫu nhiên bốc
// mất người đang cân nhắc. Cả ba đều được kiểm ở dưới.
async function canUseDatabase() {
  try {
    await pool.query('SELECT id FROM sessions LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

async function createUser(band) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, display_name, band, user_role) VALUES ($1, $2, $3, 'student')`,
    [id, `Moi ${id.slice(0, 8)}`, band]
  );
  return { id, displayName: `Moi ${id.slice(0, 8)}`, band, userRole: 'student' };
}

async function deleteUsers(userIds) {
  await pool.query(
    `DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1))`,
    [userIds]
  );
  await pool.query(`DELETE FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1)`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
}

function createServer() {
  const inboxes = new Map();
  let connectionHandler = null;

  function deliver(socketId, event, payload) {
    if (!inboxes.has(socketId)) inboxes.set(socketId, []);
    inboxes.get(socketId).push({ event, payload });
  }

  const io = {
    use() {},
    on(event, handler) {
      if (event === 'connection') connectionHandler = handler;
    },
    to(socketId) {
      return { emit: (event, payload) => deliver(socketId, event, payload) };
    },
  };

  setupSocket(io);

  function connect(account) {
    const handlers = {};
    const socket = {
      id: `socket-${randomUUID()}`,
      data: { user: account },
      on(event, handler) {
        handlers[event] = handler;
      },
      emit(event, payload) {
        deliver(socket.id, event, payload);
      },
    };
    inboxes.set(socket.id, []);
    connectionHandler(socket);

    return {
      socket,
      handlers,
      account,
      events: () => inboxes.get(socket.id).map((item) => item.event),
      find: (event) => inboxes.get(socket.id).find((item) => item.event === event),
      // Sự kiện cuối cùng cùng tên: danh sách được phát lại nhiều lần nên bản mới
      // nhất mới là bản đúng.
      last: (event) => [...inboxes.get(socket.id)].reverse().find((item) => item.event === event),
    };
  }

  return { connect };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(client, event, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const found = client.last(event);
    if (found) return found;
    await delay(10);
  }

  return null;
}

function settle() {
  return delay(250);
}

// Hàng đợi nằm ở cấp module nên dùng chung giữa mọi createServer() trong cùng
// tiến trình. Người còn sót lại của bài trước vẫn nằm trong hàng đợi của bài sau,
// mà lúc đó tài khoản đã bị xoá. Ngắt kết nối là thứ lấy họ ra.
async function disconnectAll(clients) {
  for (const client of clients) {
    await client.handlers.disconnect();
  }
}

async function enterQueue(server, account, { autoMatch = false } = {}) {
  const client = server.connect(account);
  client.handlers.find_match({ band: account.band, autoMatch });

  // Chờ 'waiting' HOẶC 'matched': ở chế độ ngẫu nhiên, người thứ hai được ghép
  // ngay nên không bao giờ nhận 'waiting', và chờ riêng nó là phí đúng 5 giây.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (client.last('waiting') || client.last('matched')) break;
    await delay(10);
  }

  return client;
}

test('người đang tự chọn KHÔNG bị máy ghép ngẫu nhiên bốc mất', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const chooser = await createUser(6);
  const random = await createUser(6);
  const userIds = [chooser.id, random.id];
  let clients = [];

  try {
    const a = await enterQueue(server, chooser, { autoMatch: false });
    const b = await enterQueue(server, random, { autoMatch: true });
    clients = [a, b];

    await settle();

    // Cùng band, thừa sức ghép nếu luật cho phép. Nhưng A đang đọc danh sách và
    // chưa chọn ai — bốc A đi lúc này là làm tính năng chọn thành vô nghĩa.
    assert.equal(a.find('matched'), undefined, 'người tự chọn không được bị ghép');
    assert.equal(b.find('matched'), undefined, 'không có ai khác ở chế độ ngẫu nhiên để ghép');
  } finally {
    await disconnectAll(clients);
    await deleteUsers(userIds);
  }
});

test('hai người cùng chế độ ngẫu nhiên thì vẫn ghép tự động như cũ', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const one = await createUser(6);
  const two = await createUser(6);
  const userIds = [one.id, two.id];
  let clients = [];

  try {
    const a = await enterQueue(server, one, { autoMatch: true });
    const b = await enterQueue(server, two, { autoMatch: true });
    clients = [a, b];

    assert.ok(await waitFor(a, 'matched'), 'A phải được ghép');
    assert.ok(await waitFor(b, 'matched'), 'B phải được ghép');
  } finally {
    await disconnectAll(clients);
    await deleteUsers(userIds);
  }
});

test('mời và đồng ý thì vào phiên, đi đúng đường ghép cũ', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const one = await createUser(6);
  const two = await createUser(6.5);
  const userIds = [one.id, two.id];
  let clients = [];

  try {
    const a = await enterQueue(server, one);
    const b = await enterQueue(server, two);
    clients = [a, b];

    // A phải nhìn thấy B trong danh sách, kèm band để mà chọn.
    const list = await waitFor(a, 'partner_list');
    assert.ok(list, 'A phải nhận được danh sách');
    const seen = list.payload.partners.find((p) => p.userId === two.id);
    assert.ok(seen, 'B phải có trong danh sách của A');
    assert.equal(seen.band, 6.5);
    assert.equal(seen.autoMatch, false);

    a.handlers.invite_partner({ toUserId: two.id });
    const received = await waitFor(b, 'invite_received');
    assert.ok(received, 'B phải nhận được lời mời');
    assert.equal(received.payload.fromUserId, one.id);

    b.handlers.respond_invite({ inviteId: received.payload.inviteId, accept: true });

    // Điểm mấu chốt: kết thúc bằng đúng sự kiện `matched` của luồng cũ, nên
    // DeviceCheck / WebRTC / review / AI không phải sửa gì.
    const matchedA = await waitFor(a, 'matched');
    const matchedB = await waitFor(b, 'matched');
    assert.ok(matchedA, 'người mời phải vào phiên');
    assert.ok(matchedB, 'người được mời phải vào phiên');
    assert.equal(matchedA.payload.sessionId, matchedB.payload.sessionId);

    const status = await pool.query('SELECT status FROM sessions WHERE id = $1', [
      matchedA.payload.sessionId,
    ]);
    assert.equal(status.rows[0].status, 'matched');
  } finally {
    await disconnectAll(clients);
    await deleteUsers(userIds);
  }
});

test('hai người cùng mời một người: ai được đồng ý thì thắng, người kia được báo', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const first = await createUser(6);
  const second = await createUser(6);
  const target = await createUser(6);
  const userIds = [first.id, second.id, target.id];
  let clients = [];

  try {
    const a = await enterQueue(server, first);
    const c = await enterQueue(server, second);
    const b = await enterQueue(server, target);
    clients = [a, c, b];

    a.handlers.invite_partner({ toUserId: target.id });
    c.handlers.invite_partner({ toUserId: target.id });

    await settle();
    const invites = [a, c].map((client) => client.last('invite_sent'));
    assert.ok(invites[0] && invites[1], 'cả hai đều gửi được lời mời');

    // B chọn A.
    const fromA = await waitFor(b, 'invite_received');
    const inviteFromA = [a.last('invite_sent')].find(Boolean);
    b.handlers.respond_invite({ inviteId: inviteFromA.payload.inviteId, accept: true });

    assert.ok(await waitFor(a, 'matched'), 'A phải được ghép');
    assert.ok(await waitFor(b, 'matched'), 'B phải được ghép');
    assert.ok(fromA, 'B có nhận lời mời');

    // C phải được báo ngay. Không có bước này thì C ngồi chờ một người đã đi
    // luyện với người khác.
    //
    // Kiểm cả LÝ DO chứ không chỉ việc có được báo: lời mời nào rồi cũng hết hạn
    // sau 30 giây, nên nếu chỉ kiểm "có invite_cancelled" thì bài này vẫn xanh cả
    // khi việc huỷ lúc ghép bị hỏng hoàn toàn — chỉ là C phải chờ hết 30 giây.
    const cancelled = await waitFor(c, 'invite_cancelled');
    assert.ok(cancelled, 'C phải được báo lời mời không còn hiệu lực');
    assert.equal(
      cancelled.payload.reason,
      'partner_matched',
      `phải huỷ vì người kia đã vào phiên, không phải vì hết hạn (thực tế: ${cancelled.payload.reason})`
    );
    assert.equal(c.find('matched'), undefined, 'C không được ghép');
  } finally {
    await disconnectAll(clients);
    await deleteUsers(userIds);
  }
});

test('mời chéo nhau thì chỉ tạo ra một phiên, không phải hai', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const one = await createUser(6);
  const two = await createUser(6);
  const userIds = [one.id, two.id];
  let clients = [];

  try {
    const a = await enterQueue(server, one);
    const b = await enterQueue(server, two);
    clients = [a, b];

    a.handlers.invite_partner({ toUserId: two.id });
    b.handlers.invite_partner({ toUserId: one.id });
    await settle();

    const toB = a.last('invite_sent');
    const toA = b.last('invite_sent');
    assert.ok(toB && toA, 'cả hai lời mời đều được gửi');

    // Cả hai cùng bấm đồng ý. Nếu không chiếm chỗ đồng bộ, chỗ này tạo ra HAI
    // phiên cho đúng hai người và cả hai đều hỏng.
    b.handlers.respond_invite({ inviteId: toB.payload.inviteId, accept: true });
    a.handlers.respond_invite({ inviteId: toA.payload.inviteId, accept: true });
    await settle();

    const sessions = await pool.query(
      `SELECT id FROM sessions WHERE (user_a_id = ANY($1) AND user_b_id = ANY($1))`,
      [userIds]
    );
    assert.equal(sessions.rows.length, 1, `chỉ được tạo 1 phiên, thực tế ${sessions.rows.length}`);
  } finally {
    await disconnectAll(clients);
    await deleteUsers(userIds);
  }
});

test('từ chối thì người mời được báo và không mời lại được người đó', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const one = await createUser(6);
  const two = await createUser(6);
  const userIds = [one.id, two.id];
  let clients = [];

  try {
    const a = await enterQueue(server, one);
    const b = await enterQueue(server, two);
    clients = [a, b];

    a.handlers.invite_partner({ toUserId: two.id });
    const received = await waitFor(b, 'invite_received');
    b.handlers.respond_invite({ inviteId: received.payload.inviteId, accept: false });

    assert.ok(await waitFor(a, 'invite_declined'), 'A phải biết là bị từ chối');

    // Và chính B — người bấm từ chối — cũng phải được xác nhận. Không có dòng này
    // thì thẻ lời mời nằm lại trên màn hình B vĩnh viễn: respond_invite đã gỡ lời
    // mời khỏi bộ nhớ kèm đồng hồ 30 giây, nên không còn sự kiện nào tới sau, và
    // nút "Đồng ý" còn đó chỉ trả về "Lời mời không còn hiệu lực".
    const closedForB = await waitFor(b, 'invite_cancelled');
    assert.ok(closedForB, 'B phải được xác nhận là lời mời đã đóng');
    assert.equal(closedForB.payload.inviteId, received.payload.inviteId);
    assert.equal(closedForB.payload.reason, 'declined');

    // Mời lại ngay lập tức là quấy rầy, nên bị chặn.
    a.handlers.invite_partner({ toUserId: two.id });
    const error = await waitFor(a, 'invite_error');
    assert.ok(error, 'không được mời lại người vừa từ chối');
    assert.equal(b.find('invite_received') && b.events().filter((e) => e === 'invite_received').length, 1);
  } finally {
    await disconnectAll(clients);
    await deleteUsers(userIds);
  }
});

test('mỗi lúc chỉ gửi được một lời mời', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const one = await createUser(6);
  const two = await createUser(6);
  const three = await createUser(6);
  const userIds = [one.id, two.id, three.id];
  let clients = [];

  try {
    const a = await enterQueue(server, one);
    const b = await enterQueue(server, two);
    const c = await enterQueue(server, three);
    clients = [a, b, c];

    a.handlers.invite_partner({ toUserId: two.id });
    await settle();
    a.handlers.invite_partner({ toUserId: three.id });

    const error = await waitFor(a, 'invite_error');
    assert.ok(error, 'lời mời thứ hai phải bị từ chối');
    assert.equal(c.find('invite_received'), undefined, 'C không được nhận lời mời nào');
  } finally {
    await disconnectAll(clients);
    await deleteUsers(userIds);
  }
});

test('lời mời tự hết hạn và cả hai bên đều được dọn', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const one = await createUser(6);
  const two = await createUser(6);
  const userIds = [one.id, two.id];
  let clients = [];

  try {
    const a = await enterQueue(server, one);
    const b = await enterQueue(server, two);
    clients = [a, b];

    a.handlers.invite_partner({ toUserId: two.id });
    await waitFor(b, 'invite_received');

    assert.ok(await waitFor(a, 'invite_expired'), 'người mời phải biết là hết hạn');
    assert.ok(await waitFor(b, 'invite_cancelled'), 'người được mời cũng phải được dọn');

    // Hết hạn không phải từ chối, nên vẫn mời lại được.
    a.handlers.invite_partner({ toUserId: two.id });
    await settle();
    assert.equal(a.last('invite_error'), undefined, 'hết hạn thì vẫn được mời lại');
  } finally {
    await disconnectAll(clients);
    await deleteUsers(userIds);
  }
});

test('người mời rời đi thì lời mời bị huỷ, không để người kia chờ mãi', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const one = await createUser(6);
  const two = await createUser(6);
  const userIds = [one.id, two.id];
  let clients = [];

  try {
    const a = await enterQueue(server, one);
    const b = await enterQueue(server, two);
    clients = [b];

    a.handlers.invite_partner({ toUserId: two.id });
    const received = await waitFor(b, 'invite_received');
    assert.ok(received);

    await a.handlers.disconnect();

    assert.ok(await waitFor(b, 'invite_cancelled'), 'B phải được báo lời mời đã huỷ');

    // Và đồng ý một lời mời đã chết thì phải bị từ chối tử tế.
    b.handlers.respond_invite({ inviteId: received.payload.inviteId, accept: true });
    assert.ok(await waitFor(b, 'invite_error'), 'không được ghép với người đã rời');
    assert.equal(b.find('matched'), undefined);
  } finally {
    await disconnectAll(clients);
    await deleteUsers(userIds);
  }
});

test('danh sách trộn band: có người ngang, người cao hơn và người thấp hơn', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const viewer = await createUser(6);
  // Bốn người ngang band để nếu xếp phẳng theo độ gần thì họ chiếm hết chỗ.
  const peers = [];
  for (const band of [6, 6, 6, 6, 8, 8.5, 4, 3.5]) {
    peers.push(await createUser(band));
  }
  const userIds = [viewer.id, ...peers.map((p) => p.id)];
  let clients = [];

  try {
    for (const peer of peers) {
      clients.push(await enterQueue(server, peer));
    }
    const me = await enterQueue(server, viewer);
    clients.push(me);

    const list = await waitFor(me, 'partner_list');
    assert.ok(list, 'phải nhận được danh sách');

    const partners = list.payload.partners;
    assert.ok(partners.length > 0);
    assert.equal(
      partners.some((p) => p.userId === viewer.id),
      false,
      'không được có chính mình trong danh sách'
    );

    const higher = partners.filter((p) => p.band - 6 >= 0.5);
    const lower = partners.filter((p) => p.band - 6 <= -0.5);

    // Đây là điểm của việc trộn: xếp phẳng theo độ gần thì bốn người band 6 sẽ
    // chiếm hết và người dùng không bao giờ thấy ai khác trình độ mình.
    assert.ok(higher.length > 0, `phải có người band cao hơn, thực tế: ${JSON.stringify(partners.map((p) => p.band))}`);
    assert.ok(lower.length > 0, `phải có người band thấp hơn, thực tế: ${JSON.stringify(partners.map((p) => p.band))}`);
  } finally {
    await disconnectAll(clients);
    await deleteUsers(userIds);
  }
});
