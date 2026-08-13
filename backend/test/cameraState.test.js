import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
import { setupSocket } from '../src/socket/index.js';

// Tắt camera chỉ làm luồng video ngừng chảy, mà ngừng chảy thì thẻ <video> bên kia
// đứng lại ở khung cuối chứ không đen đi — trông như hình bị treo. Nên bên tắt phải
// nói thẳng cho đối tác biết, qua kênh `signal` sẵn có. Bộ test này giữ hai điều:
// tin đó phải sang được đúng đối tác, và phải sang NGUYÊN VẸN (client nhận đọc
// `payload.off` để quyết định hiện lớp phủ).

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
    [id, `Cam ${id.slice(0, 8)}`, band]
  );
  return { id, displayName: `Cam ${id.slice(0, 8)}`, band, userRole: 'student' };
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
      all: () => [...inboxes.get(socket.id)],
      find: (event) => inboxes.get(socket.id).find((item) => item.event === event),
      signals: () => inboxes.get(socket.id).filter((item) => item.event === 'signal'),
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

// Đủ lâu để một tin định tới thì đã tới, nhờ đó khẳng định "không tới" mới có nghĩa.
function settle() {
  return delay(300);
}

async function matchPair(server) {
  const accountA = await createUser(6);
  const accountB = await createUser(6);
  const clientA = server.connect(accountA);
  const clientB = server.connect(accountB);

  clientA.handlers.find_match({ band: 6, autoMatch: true, focus: 'part2' });
  await waitFor(clientA, 'waiting');
  clientB.handlers.find_match({ band: 6, autoMatch: true, focus: 'part2' });
  const matched = await waitFor(clientA, 'matched');

  return { accountA, accountB, clientA, clientB, matched };
}

test('trạng thái camera được chuyển nguyên vẹn sang đối tác', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Database not available');
    return;
  }

  const server = createServer();
  const { accountA, accountB, clientA, clientB, matched } = await matchPair(server);

  try {
    assert.ok(matched, 'phải ghép được cặp trước khi thử gửi trạng thái camera');

    clientA.handlers.signal({ type: 'camera_state', payload: { off: true } });
    await settle();

    const received = clientB.signals();
    assert.equal(received.length, 1, 'đối tác phải nhận đúng một tin');
    assert.deepEqual(
      received[0].payload,
      { type: 'camera_state', payload: { off: true } },
      'tin phải sang nguyên vẹn: client nhận đọc payload.off để hiện lớp phủ'
    );

    // Bật lại camera cũng phải báo, nếu không lớp phủ bên kia ở lại vĩnh viễn.
    clientA.handlers.signal({ type: 'camera_state', payload: { off: false } });
    await settle();

    const afterOn = clientB.signals();
    assert.equal(afterOn.length, 2);
    assert.equal(afterOn[1].payload.payload.off, false);

    // Người gửi không được nhận lại tin của chính mình.
    assert.equal(clientA.signals().length, 0, 'tin không được dội về người gửi');
  } finally {
    clientA.handlers.disconnect();
    clientB.handlers.disconnect();
    await deleteUsers([accountA.id, accountB.id]);
  }
});

test('tin có type lạ bị bỏ, không lọt sang đối tác', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Database not available');
    return;
  }

  const server = createServer();
  const { accountA, accountB, clientA, clientB, matched } = await matchPair(server);

  try {
    assert.ok(matched);

    // Chốt lại việc lọc theo danh sách type: thêm 'camera_state' vào danh sách cho
    // phép không được biến kênh signal thành đường chuyển tiếp gì cũng được.
    clientA.handlers.signal({ type: 'camera_state_evil', payload: { off: true } });
    clientA.handlers.signal({ type: 'camera_state' });
    clientA.handlers.signal(null);
    await settle();

    assert.equal(clientB.signals().length, 0, 'chỉ type trong danh sách và có payload mới được chuyển');
  } finally {
    clientA.handlers.disconnect();
    clientB.handlers.disconnect();
    await deleteUsers([accountA.id, accountB.id]);
  }
});
