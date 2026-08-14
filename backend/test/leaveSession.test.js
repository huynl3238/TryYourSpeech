import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
// Đủ ngắn để test xem được lúc hết thời gian chờ, đủ dài để nối lại trong đó không
// thành cuộc đua. Phải đặt TRƯỚC khi nạp module socket.
process.env.SOCKET_RECONNECT_GRACE_MS = '1000';

import { setupSocket } from '../src/socket/index.js';

// Rời phiên có chủ đích và rớt mạng đến server là hai việc giống hệt nhau — socket
// đứt, không kèm lý do — nên server buộc phải đoán, và nó đoán là rớt mạng. Bộ test
// này giữ lấy đường thoát rõ ràng: bên đi nói trước khi đóng, để người còn lại
// không bị bảo là "đối tác đang kết nối lại" về một người sẽ không quay lại.

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
    [id, `Leave ${id.slice(0, 8)}`, band]
  );
  return { id, displayName: `Leave ${id.slice(0, 8)}`, band, userRole: 'student' };
}

async function deleteUsers(userIds) {
  await pool.query(
    `DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1))`,
    [userIds]
  );
  await pool.query(`DELETE FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1)`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
}

async function getSessionStatus(sessionId) {
  const result = await pool.query('SELECT status FROM sessions WHERE id = $1', [sessionId]);
  return result.rows[0]?.status || null;
}

// Mỗi io.to(socketId).emit phải vào đúng hộp của người nhận: cả bộ test này nói về
// việc MỘT người được báo gì khi người KIA làm gì đó.
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
      events: () => inboxes.get(socket.id).map((item) => item.event),
      find: (event) => inboxes.get(socket.id).find((item) => item.event === event),
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
    const found = client.find(event);
    if (found) return found;
    await delay(10);
  }

  return null;
}

// Đủ lâu để tin nào định tới thì đã tới, nhờ đó "không tới" mới là một khẳng định.
function settle() {
  return delay(200);
}

async function matchTwoClients() {
  const server = createServer();
  const accountA = await createUser(6);
  const accountB = await createUser(6);

  const clientA = server.connect(accountA);
  const clientB = server.connect(accountB);

  clientA.handlers.find_match({ band: 6, autoMatch: true });
  await waitFor(clientA, 'waiting');
  clientB.handlers.find_match({ band: 6, autoMatch: true });

  const matched = await waitFor(clientA, 'matched');
  assert.ok(matched, 'hai người cùng band phải được ghép');

  return {
    server,
    clientA,
    clientB,
    accountA,
    accountB,
    sessionId: matched.payload.sessionId,
    userIds: [accountA.id, accountB.id],
  };
}

test('bấm thoát giữa buổi: đối tác biết ngay, không bị bắt chờ người đã đi', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { clientA, clientB, sessionId, userIds } = await matchTwoClients();

  try {
    clientA.handlers.leave_session();
    // Nút thoát đóng socket ngay sau khi báo, nên phải đúng thứ tự đó.
    clientA.handlers.disconnect();

    assert.ok(await waitFor(clientB, 'partner_disconnected'), 'đối tác phải được báo ngay');
    assert.equal(
      clientB.events().includes('partner_reconnecting'),
      false,
      'không được bảo là đang kết nối lại: người kia đã đi hẳn'
    );
    assert.equal(await getSessionStatus(sessionId), 'abandoned', 'bỏ giữa buổi là bỏ dở thật');
  } finally {
    await deleteUsers(userIds);
  }
});

test('thoát rồi thì lần nối lại sau không bị nhét về phòng cũ', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { server, clientA, accountA, userIds } = await matchTwoClients();

  try {
    clientA.handlers.leave_session();
    clientA.handlers.disconnect();
    await settle();

    // Về trang chủ là trang tự mở lại socket. Trước đây cú disconnect ở trên được
    // hiểu là rớt mạng, phòng vẫn được giữ, nên lần nối lại này bị đưa thẳng về
    // đúng cái phòng vừa bỏ — kéo theo cả thông báo chờ của phiên đã kết thúc.
    const clientAgain = server.connect(accountA);
    await settle();

    assert.equal(
      clientAgain.events().includes('session_resumed'),
      false,
      'đã thoát thì không được đưa về phòng cũ'
    );
  } finally {
    await deleteUsers(userIds);
  }
});

test('rời sau khi luyện xong: chỉ báo cho đối tác, phiên không bị đánh là bỏ dở', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { clientA, clientB, sessionId, userIds } = await matchTwoClients();

  try {
    clientA.handlers.device_ready();
    clientB.handlers.device_ready();
    clientA.handlers.peer_connected();
    clientB.handlers.peer_connected();
    assert.ok(await waitFor(clientA, 'session_start'));

    // Hết giờ nói, cả hai sang phần ghi chú. B đóng tab ở đó.
    clientA.handlers.practice_complete();
    clientB.handlers.leave_session();
    clientB.handlers.disconnect();

    assert.ok(await waitFor(clientA, 'partner_left'), 'phải biết đối tác đã đi');
    assert.equal(
      clientA.events().includes('partner_disconnected'),
      false,
      'không được dựng màn hình lỗi: phần ghi chú vẫn làm tiếp một mình được'
    );
    assert.notEqual(
      await getSessionStatus(sessionId),
      'abandoned',
      'phiên đã luyện xong mà bị đánh bỏ dở thì chặn luôn việc chấm'
    );
  } finally {
    await deleteUsers(userIds);
  }
});

test('đóng tab đột ngột sau khi luyện xong vẫn phải báo cho người còn lại', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { clientA, clientB, sessionId, userIds } = await matchTwoClients();

  try {
    clientA.handlers.device_ready();
    clientB.handlers.device_ready();
    clientA.handlers.peer_connected();
    clientB.handlers.peer_connected();
    assert.ok(await waitFor(clientA, 'session_start'));

    clientA.handlers.practice_complete();

    // Không có `leave_session`: đóng tab thì không gửi được gì. Trước đây nhánh
    // này xoá phòng trong im lặng, A không bao giờ biết B đã đi.
    clientB.handlers.disconnect();

    assert.ok(await waitFor(clientA, 'partner_left'), 'im lặng ở đây là để người ta chờ mãi');
    assert.notEqual(await getSessionStatus(sessionId), 'abandoned');
  } finally {
    await deleteUsers(userIds);
  }
});

test('rớt mạng giữa buổi vẫn được chờ như cũ', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { clientA, clientB, userIds } = await matchTwoClients();

  try {
    // Không gọi `leave_session`: đây là rớt mạng thật. Thêm đường thoát rõ ràng
    // không được phép biến mọi cú rớt mạng thành "đi hẳn" — mất mạng ba giây mà
    // bị kết thúc phiên chính là lỗi mà cơ chế chờ sinh ra để chặn.
    clientA.handlers.disconnect();

    assert.ok(await waitFor(clientB, 'partner_reconnecting'), 'rớt mạng thì vẫn phải chờ');
    assert.equal(clientB.events().includes('partner_left'), false);
  } finally {
    await deleteUsers(userIds);
  }
});
