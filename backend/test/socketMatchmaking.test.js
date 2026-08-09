import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
import { setupSocket } from '../src/socket/index.js';

// Matchmaking sits either side of an await on the database, and the interesting
// failures all happen inside that window: someone closes their tab while the
// session row is being written. These tests can reach into that window because
// the handlers are driven directly — firing find_match without awaiting it leaves
// the insert in flight, and the disconnect can be delivered on top of it.
async function canUseDatabase() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function createUser(band) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, display_name, band, user_role) VALUES ($1, $2, $3, 'student')`,
    [id, `Match ${id.slice(0, 8)}`, band]
  );
  return { id, displayName: `Match ${id.slice(0, 8)}`, band, userRole: 'student' };
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
      events: () => inboxes.get(socket.id).map((item) => item.event),
      find: (event) => inboxes.get(socket.id).find((item) => item.event === event),
    };
  }

  return { connect };
}

// The queues live at module scope and are shared by every createServer() in the
// process, so a client left waiting at the end of one test is still in the queue
// for the next one — and by then its user row has been deleted. Disconnecting is
// what takes an entry out.
async function disconnectAll(clients) {
  for (const client of clients) {
    await client.handlers.disconnect();
  }
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

// Long enough that an event which was going to arrive has arrived, so asserting
// one did NOT arrive means something.
function settle() {
  return delay(300);
}

async function countSessionsFor(userIds) {
  const result = await pool.query(
    'SELECT status, COUNT(*)::int AS count FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1) GROUP BY status',
    [userIds]
  );

  return Object.fromEntries(result.rows.map((row) => [row.status, row.count]));
}

test('người rời đi giữa lúc đang tạo phiên thì không dựng phòng với socket đã chết', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const accountA = await createUser(6);
  const accountB = await createUser(6);
  const userIds = [accountA.id, accountB.id];

  try {
    const clientA = server.connect(accountA);
    const clientB = server.connect(accountB);

    clientA.handlers.find_match({ band: 6, autoMatch: true });
    await waitFor(clientA, 'waiting');

    // Deliberately not awaited: this leaves the session insert in flight.
    const matching = clientB.handlers.find_match({ band: 6, autoMatch: true });
    // A closes the tab while that insert is still running.
    await clientA.handlers.disconnect();
    await matching;
    await settle();

    // B must not be handed a room whose other occupant is already gone. That
    // used to happen, and B then sat on the device check for the full 60s ready
    // timeout before being told anything at all.
    assert.equal(clientB.find('matched'), undefined, 'không được ghép với người đã rời');

    // The session row that was written for the pair has to be closed out, not
    // left sitting in `matched` forever.
    const byStatus = await countSessionsFor(userIds);
    assert.equal(byStatus.matched, undefined, 'không được để lại phiên treo ở trạng thái matched');
    assert.ok(byStatus.abandoned >= 1, 'phiên vừa tạo phải được đánh dấu abandoned');

    // ...and B is put back to waiting rather than dumped out of matchmaking.
    assert.ok(await waitFor(clientB, 'waiting'), 'B phải được đưa lại hàng đợi');
    await disconnectAll([clientB]);
  } finally {
    await deleteUsers(userIds);
  }
});

test('người còn lại được ghép ngay với người mới tới sau đó', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = createServer();
  const accountA = await createUser(6);
  const accountB = await createUser(6);
  const accountC = await createUser(6);
  const userIds = [accountA.id, accountB.id, accountC.id];

  try {
    const clientA = server.connect(accountA);
    const clientB = server.connect(accountB);
    const clientC = server.connect(accountC);

    clientA.handlers.find_match({ band: 6, autoMatch: true });
    await waitFor(clientA, 'waiting');

    const matching = clientB.handlers.find_match({ band: 6, autoMatch: true });
    await clientA.handlers.disconnect();
    await matching;
    await settle();

    assert.equal(clientB.find('matched'), undefined);

    // B is back in the queue, so an ordinary new arrival should pair with them.
    // If the requeue had put a dead entry back instead, C would be matched with
    // a socket nobody is listening on.
    clientC.handlers.find_match({ band: 6, autoMatch: true });

    const matchedC = await waitFor(clientC, 'matched');
    const matchedB = await waitFor(clientB, 'matched');
    assert.ok(matchedC, 'C phải được ghép');
    assert.ok(matchedB, 'B phải được ghép cùng C');
    assert.equal(matchedC.payload.sessionId, matchedB.payload.sessionId);
    await disconnectAll([clientB, clientC]);
  } finally {
    await deleteUsers(userIds);
  }
});
