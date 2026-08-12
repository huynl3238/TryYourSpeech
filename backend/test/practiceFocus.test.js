import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
import { getSessionDetail } from '../src/models/sessionModel.js';
import { setupSocket } from '../src/socket/index.js';

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
    [id, `Focus ${id.slice(0, 8)}`, band]
  );
  return { id, displayName: `Focus ${id.slice(0, 8)}`, band, userRole: 'student' };
}

async function deleteUsers(userIds) {
  await pool.query(
    `DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1))`,
    [userIds]
  );
  await pool.query(`DELETE FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1)`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
}

// Cùng khuôn với sessionLifecycle.test.js: mỗi socket có hộp thư riêng, vì các
// tình huống ở đây nói về việc AI được gửi gì, không phải một socket duy nhất.
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
      findLast: (event) => [...inboxes.get(socket.id)].reverse().find((item) => item.event === event),
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

// Đủ lâu để một sự kiện định tới thì đã tới, nhờ đó khẳng định "không được ghép"
// mới có ý nghĩa.
function settle() {
  return delay(300);
}

// Format IELTS thật, cũng là thứ mà việc chọn part phải giữ nguyên cho từng phần.
const EXPECTED_BY_FOCUS = {
  part1: { parts: [1], turns: 8, durationMs: 45000, prepDurationMs: 0 },
  part2: { parts: [2], turns: 2, durationMs: 120000, prepDurationMs: 60000 },
  part3: { parts: [3], turns: 6, durationMs: 60000, prepDurationMs: 0 },
};

for (const focus of ['part1', 'part2', 'part3']) {
  test(`chọn ${focus} thì phiên chỉ có câu hỏi của phần đó, đúng thời lượng thật`, async (t) => {
    if (!(await canUseDatabase())) {
      t.skip('Database not available');
      return;
    }

    const server = createServer();
    const accountA = await createUser(6);
    const accountB = await createUser(6);

    try {
      const clientA = server.connect(accountA);
      const clientB = server.connect(accountB);

      clientA.handlers.find_match({ band: 6, autoMatch: true, focus });
      await waitFor(clientA, 'waiting');
      clientB.handlers.find_match({ band: 6, autoMatch: true, focus });

      const matched = await waitFor(clientA, 'matched');
      assert.ok(matched, 'hai người chọn cùng phần phải được ghép');

      const detail = await getSessionDetail(matched.payload.sessionId);
      const expected = EXPECTED_BY_FOCUS[focus];

      assert.equal(detail.session.focus, focus, 'phần luyện phải được ghi vào phiên');
      assert.equal(detail.turns.length, expected.turns);
      assert.deepEqual(
        [...new Set(detail.turns.map((turn) => turn.partNumber))],
        expected.parts,
        'không được lẫn câu hỏi của phần khác'
      );
      assert.ok(
        detail.turns.every((turn) => turn.durationMs === expected.durationMs),
        `mọi lượt phải dài ${expected.durationMs}ms`
      );
      assert.ok(
        detail.turns.every((turn) => turn.prepDurationMs === expected.prepDurationMs),
        `thời gian chuẩn bị phải là ${expected.prepDurationMs}ms`
      );
    } finally {
      await deleteUsers([accountA.id, accountB.id]);
    }
  });
}

test('hai người chọn hai phần khác nhau thì không được ghép', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Database not available');
    return;
  }

  const server = createServer();
  const accountA = await createUser(6);
  const accountB = await createUser(6);

  try {
    const clientA = server.connect(accountA);
    const clientB = server.connect(accountB);

    clientA.handlers.find_match({ band: 6, autoMatch: true, focus: 'part1' });
    await waitFor(clientA, 'waiting');
    clientB.handlers.find_match({ band: 6, autoMatch: true, focus: 'part3' });
    await waitFor(clientB, 'waiting');

    await settle();

    // Band trùng khớp hoàn toàn, nên nếu vẫn không ghép thì đúng là phần luyện
    // chặn — không phải vì lý do nào khác.
    assert.equal(clientA.find('matched'), undefined, 'người luyện Part 1 không được ghép');
    assert.equal(clientB.find('matched'), undefined, 'người luyện Part 3 không được ghép');
  } finally {
    await deleteUsers([accountA.id, accountB.id]);
  }
});

test('danh sách tự chọn chỉ hiện người cùng phần luyện', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Database not available');
    return;
  }

  const server = createServer();
  const viewer = await createUser(6);
  const samePart = await createUser(6);
  const otherPart = await createUser(6);

  try {
    const clientViewer = server.connect(viewer);
    const clientSame = server.connect(samePart);
    const clientOther = server.connect(otherPart);

    clientViewer.handlers.find_match({ band: 6, autoMatch: false, focus: 'part2' });
    clientOther.handlers.find_match({ band: 6, autoMatch: false, focus: 'part3' });
    clientSame.handlers.find_match({ band: 6, autoMatch: false, focus: 'part2' });

    await waitFor(clientViewer, 'partner_list');
    await settle();

    const list = clientViewer.findLast('partner_list').payload.partners;
    const ids = list.map((partner) => partner.userId);

    assert.ok(ids.includes(samePart.id), 'người cùng Part 2 phải xuất hiện');
    assert.ok(!ids.includes(otherPart.id), 'người luyện Part 3 không được xuất hiện');
    assert.ok(
      list.every((partner) => partner.focus === 'part2'),
      'mọi người trong danh sách phải cùng phần luyện với người xem'
    );
  } finally {
    await deleteUsers([viewer.id, samePart.id, otherPart.id]);
  }
});

test('mời người đang luyện phần khác thì bị từ chối', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Database not available');
    return;
  }

  const server = createServer();
  const inviter = await createUser(6);
  const target = await createUser(6);

  try {
    const clientInviter = server.connect(inviter);
    const clientTarget = server.connect(target);

    clientInviter.handlers.find_match({ band: 6, autoMatch: false, focus: 'part1' });
    clientTarget.handlers.find_match({ band: 6, autoMatch: false, focus: 'part2' });
    await waitFor(clientTarget, 'waiting');

    // Danh sách đã lọc nên giao diện không cho bấm; đây là client giữ danh sách
    // cũ, hoặc một client tự gọi thẳng sự kiện.
    clientInviter.handlers.invite_partner({ toUserId: target.id });
    await settle();

    const error = clientInviter.find('invite_error');
    assert.ok(error, 'phải nhận lỗi thay vì lời mời được gửi đi');
    assert.match(error.payload.error, /phần khác/);
    assert.equal(clientTarget.find('invite_received'), undefined, 'người kia không được nhận lời mời');
  } finally {
    await deleteUsers([inviter.id, target.id]);
  }
});

test('phần luyện không hợp lệ bị từ chối, không vào hàng đợi', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Database not available');
    return;
  }

  const server = createServer();
  const account = await createUser(6);

  try {
    const client = server.connect(account);
    client.handlers.find_match({ band: 6, autoMatch: true, focus: 'part9' });
    await settle();

    const error = client.find('match_error');
    assert.ok(error, 'phải báo lỗi');
    assert.match(error.payload.error, /Phan luyen tap/);
    assert.equal(client.find('waiting'), undefined, 'không được đưa vào hàng đợi');
  } finally {
    await deleteUsers([account.id]);
  }
});

test('client cũ không gửi phần luyện thì vẫn được buổi đầy đủ', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Database not available');
    return;
  }

  const server = createServer();
  const accountA = await createUser(6);
  const accountB = await createUser(6);

  try {
    const clientA = server.connect(accountA);
    const clientB = server.connect(accountB);

    clientA.handlers.find_match({ band: 6, autoMatch: true });
    await waitFor(clientA, 'waiting');
    clientB.handlers.find_match({ band: 6, autoMatch: true });

    const matched = await waitFor(clientA, 'matched');
    assert.ok(matched, 'thiếu focus vẫn phải ghép được');

    const detail = await getSessionDetail(matched.payload.sessionId);
    assert.equal(detail.session.focus, 'full');
    assert.deepEqual(
      [...new Set(detail.turns.map((turn) => turn.partNumber))],
      [1, 2, 3],
      'buổi đầy đủ phải có cả ba phần'
    );
  } finally {
    await deleteUsers([accountA.id, accountB.id]);
  }
});
