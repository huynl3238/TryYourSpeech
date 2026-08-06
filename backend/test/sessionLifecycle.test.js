import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
import { markSessionAbandoned } from '../src/models/sessionModel.js';
// Short enough that a test can watch the grace period expire, long enough that
// reconnecting inside it is not a race. Set before the socket module is loaded.
process.env.SOCKET_RECONNECT_GRACE_MS = '1000';

import { setupSocket } from '../src/socket/index.js';

async function canUseDatabase() {
  try {
    await pool.query('SELECT id FROM sessions LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

// Matchmaking only writes back a band; the account itself has to exist already.
async function createUser(band) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, display_name, band, user_role) VALUES ($1, $2, $3, 'student')`,
    [id, `Test ${id.slice(0, 8)}`, band]
  );
  return { id, displayName: `Test ${id.slice(0, 8)}`, band, userRole: 'student' };
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

// The socket tests elsewhere use a single socket and drop directed emits. These
// scenarios are about what one client is told when something happens to the
// other, so every io.to(socketId).emit has to be captured per recipient.
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

// The socket layer registers handlers that swallow their own promise (they end
// in .catch(...)), so awaiting a handler proves nothing. Every wait here has to
// be on the observable result instead.
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

async function waitForStatus(sessionId, expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let status = null;

  while (Date.now() < deadline) {
    status = await getSessionStatus(sessionId);
    if (status === expected) return status;
    await delay(10);
  }

  return status;
}

// Long enough for any event that was going to arrive to have arrived, so that
// asserting an event did NOT happen means something.
function settle() {
  return delay(200);
}

// Puts two clients through matchmaking and returns them already matched.
async function matchTwoClients() {
  const server = createServer();
  const accountA = await createUser(6);
  const accountB = await createUser(6);

  const clientA = server.connect(accountA);
  const clientB = server.connect(accountB);

  clientA.handlers.find_match({ band: 6 });
  await waitFor(clientA, 'waiting');
  clientB.handlers.find_match({ band: 6 });

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

test('a session is not started until WebRTC actually connects', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { clientA, clientB, sessionId, userIds } = await matchTwoClients();

  try {
    // Both press "I'm ready". That only proves their microphones work.
    clientA.handlers.device_ready();
    clientB.handlers.device_ready();

    assert.ok(await waitFor(clientA, 'begin_signaling'));
    assert.ok(clientB.events().includes('begin_signaling'));

    // This is the regression: the ready button used to start the session, so the
    // server called it active while the two browsers had exchanged nothing.
    await settle();
    assert.equal(clientA.events().includes('session_start'), false);
    assert.equal(await getSessionStatus(sessionId), 'matched');

    clientA.handlers.peer_connected();
    await settle();
    assert.equal(clientB.events().includes('session_start'), false, 'một bên kết nối là chưa đủ');

    clientB.handlers.peer_connected();

    assert.ok(await waitFor(clientA, 'session_start'));
    assert.ok(clientB.events().includes('session_start'));
    assert.equal(await waitForStatus(sessionId, 'active'), 'active');
  } finally {
    await deleteUsers(userIds);
  }
});

test('a broken microphone is reported as a device fault, not as the partner leaving', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { clientA, clientB, userIds } = await matchTwoClients();

  try {
    clientA.handlers.device_ready();
    clientB.handlers.device_failed();

    assert.ok(
      await waitFor(clientA, 'partner_device_failed'),
      'đối tác phải biết đúng nguyên nhân là lỗi thiết bị'
    );
    assert.equal(
      clientA.events().includes('partner_disconnected'),
      false,
      'không được báo thành ngắt kết nối'
    );

    // The person it happened to is already looking at their own device error.
    assert.equal(clientB.events().includes('partner_device_failed'), false);
  } finally {
    await deleteUsers(userIds);
  }
});

test('leaving after the practice finished does not abandon the session', async (t) => {
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
    assert.equal(await waitForStatus(sessionId, 'active'), 'active');

    // Practice runs out and both move to the review phase.
    clientA.handlers.practice_complete();
    clientB.handlers.practice_complete();

    // Now one of them refreshes, closes the tab, or searches for a new partner.
    // This used to abandon a session that had already been practised: review
    // completion then rejected it and the AI never ran on either person's audio.
    clientA.handlers.disconnect();
    await settle();

    assert.equal(
      clientB.events().includes('partner_disconnected'),
      false,
      'phiên đã luyện xong thì rời trang không phải là sự cố'
    );
    assert.equal(await getSessionStatus(sessionId), 'active');
  } finally {
    await deleteUsers(userIds);
  }
});

test('leaving while the call is still being set up does abandon the session', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { clientA, clientB, sessionId, userIds } = await matchTwoClients();

  try {
    clientA.handlers.device_ready();
    clientB.handlers.device_ready();

    clientA.handlers.disconnect();

    // Leaving is now judged after the reconnect grace, not on the dropped socket
    // itself — a lost socket and a person walking away look identical at first.
    // The partner is told someone is coming back before being told they left.
    assert.ok(await waitFor(clientB, 'partner_reconnecting'));
    assert.ok(await waitFor(clientB, 'partner_disconnected'));
    assert.equal(await waitForStatus(sessionId, 'abandoned'), 'abandoned');
  } finally {
    await deleteUsers(userIds);
  }
});

test('mất kết nối thoáng qua rồi vào lại thì phiên vẫn tiếp tục', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { server, clientA, clientB, accountA, sessionId, userIds } = await matchTwoClients();

  try {
    clientA.handlers.device_ready();
    clientB.handlers.device_ready();
    clientA.handlers.disconnect();

    assert.ok(await waitFor(clientB, 'partner_reconnecting'), 'B phải được báo là đang chờ nối lại');

    // Same person, new socket — which is all a reconnect ever is.
    const clientARejoined = server.connect(accountA);
    const resumed = await waitFor(clientARejoined, 'session_resumed');

    assert.ok(resumed, 'A phải được đưa lại vào phòng cũ');
    assert.equal(resumed.payload.sessionId, sessionId);
    assert.ok(await waitFor(clientB, 'partner_reconnected'), 'B phải được báo là đã nối lại');

    // The session must survive untouched. Before the grace period this was an
    // abandoned session and neither person could get back into it.
    assert.equal(await getSessionStatus(sessionId), 'matched');

    // A had already pressed ready before dropping. If that were forgotten, the
    // room would sit waiting for a second press that is never coming.
    clientARejoined.handlers.peer_connected();
    clientB.handlers.peer_connected();
    assert.ok(await waitFor(clientARejoined, 'session_start'), 'phiên phải bắt đầu được sau khi nối lại');
  } finally {
    await deleteUsers(userIds);
  }
});

test('rớt mạng giữa bài rồi bạn kia luyện xong thì phiên không bị đánh hỏng', async (t) => {
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
    assert.equal(await waitForStatus(sessionId, 'active'), 'active');

    // A drops mid-practice and does not come back. The grace timer is now
    // running against a room whose practice is still going.
    clientA.handlers.disconnect();
    assert.ok(await waitFor(clientB, 'partner_reconnecting'));

    // B plays out the rest and finishes. This lands before the grace expires.
    clientB.handlers.practice_complete();

    // The recording exists and the peer notes are still owed, so the session has
    // to survive the timer firing afterwards.
    await delay(1400);
    assert.notEqual(await getSessionStatus(sessionId), 'abandoned');
  } finally {
    await deleteUsers(userIds);
  }
});

test('a session being reviewed can never be abandoned', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { sessionId, userIds } = await matchTwoClients();

  try {
    await pool.query("UPDATE sessions SET status = 'reviewing' WHERE id = $1", [sessionId]);

    // The practice is already recorded and both sides still owe each other their
    // error marks. Abandoning here destroyed finished work, and any disconnect
    // during review reached this line.
    await markSessionAbandoned(sessionId);

    assert.equal(await getSessionStatus(sessionId), 'reviewing');
  } finally {
    await deleteUsers(userIds);
  }
});
