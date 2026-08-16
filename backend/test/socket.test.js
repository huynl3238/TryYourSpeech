import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEarlyTurnEnd, resolveSearchWhileInRoom, setupSocket } from '../src/socket/index.js';

let accountCounter = 0;

function createAccount(overrides = {}) {
  accountCounter += 1;

  return {
    id: `11111111-1111-4111-8111-${String(accountCounter).padStart(12, '0')}`,
    displayName: `Nguoi dung ${accountCounter}`,
    band: 6,
    userRole: 'student',
    ...overrides,
  };
}

// The socket layer now takes its identity from socket.data.user, which the
// handshake middleware fills in from the auth cookie. The harness plays the part
// of that middleware.
function createSocketHarness(account = createAccount()) {
  const handlers = {};
  const emitted = [];
  const socket = {
    id: `socket-${Math.random()}`,
    data: { user: account },
    on(event, handler) {
      handlers[event] = handler;
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
  };
  const middlewares = [];
  const io = {
    use(fn) {
      middlewares.push(fn);
    },
    on(event, handler) {
      if (event === 'connection') {
        handler(socket);
      }
    },
    to() {
      return { emit() {} };
    },
  };

  setupSocket(io);

  return { handlers, emitted, middlewares, account, socket };
}

test('handshake is rejected without a valid access token', async () => {
  const { middlewares } = createSocketHarness();

  assert.equal(middlewares.length, 1);

  const error = await new Promise((resolve) => {
    middlewares[0]({ handshake: { headers: {}, auth: {} }, data: {} }, resolve);
  });

  assert.ok(error instanceof Error);
  assert.equal(error.message, 'unauthorized');
});

test('find_match rejects invalid payloads with match_error', async () => {
  const { handlers, emitted } = createSocketHarness();

  await handlers.find_match({ band: 'bad' });
  await handlers.find_match({ band: '   ' });
  await handlers.find_match({ band: 12 });
  await handlers.find_match(null);

  assert.equal(emitted.length, 4);
  assert.deepEqual(
    emitted.map((item) => item.event),
    ['match_error', 'match_error', 'match_error', 'match_error']
  );
});

test('find_match accepts valid payloads and enters waiting state', async () => {
  const { handlers, emitted } = createSocketHarness();

  await handlers.find_match({ band: '6.5' });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, 'waiting');
  handlers.cancel_find_match();
});

test('find_match accepts mentor mode users into mentor queues', async () => {
  const mentorHarness = createSocketHarness(createAccount({ userRole: 'mentor', band: null }));
  await mentorHarness.handlers.find_match({ mode: 'mentor' });

  assert.equal(mentorHarness.emitted.length, 1);
  assert.equal(mentorHarness.emitted[0].event, 'waiting');
  mentorHarness.handlers.cancel_find_match();

  const studentHarness = createSocketHarness();
  await studentHarness.handlers.find_match({ band: 5.5, mode: 'mentor' });

  assert.equal(studentHarness.emitted.length, 1);
  assert.equal(studentHarness.emitted[0].event, 'waiting');
  studentHarness.handlers.cancel_find_match();
});

// The role is read from the account, so a mentor cannot slip into peer
// matchmaking by sending userRole: 'student' (or the other way round).
test('find_match rejects mentor accounts in peer mode', async () => {
  const { handlers, emitted } = createSocketHarness(createAccount({ userRole: 'mentor' }));

  await handlers.find_match({ band: 7, userRole: 'student' });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, 'match_error');
});

test('the same account cannot queue twice from two tabs', async () => {
  const account = createAccount();
  const firstTab = createSocketHarness(account);
  const secondTab = createSocketHarness(account);

  await firstTab.handlers.find_match({ band: 6 });
  await secondTab.handlers.find_match({ band: 6 });

  assert.equal(firstTab.emitted[0].event, 'waiting');
  assert.equal(secondTab.emitted[0].event, 'match_error');
  firstTab.handlers.cancel_find_match();
});

// --- Kết thúc lượt nói sớm ---
//
// Server không giữ danh sách lượt nên nó không tự tính được lịch trình; việc duy
// nhất của nó là làm điểm phát chung, để hai máy rút ngắn cùng một lượt bằng cùng
// một con số. Nếu chỗ này trả lời khác nhau cho hai lần hỏi về cùng một lượt thì
// hai máy chạy lệch nhau suốt phần còn lại của buổi luyện.

test('resolveEarlyTurnEnd bỏ qua payload không dùng được', () => {
  assert.equal(resolveEarlyTurnEnd(null, undefined), null);
  assert.equal(resolveEarlyTurnEnd({}, undefined), null);
  assert.equal(resolveEarlyTurnEnd({ turnIndex: -1, spokenMs: 100 }, undefined), null);
  assert.equal(resolveEarlyTurnEnd({ turnIndex: 1.5, spokenMs: 100 }, undefined), null);
  assert.equal(resolveEarlyTurnEnd({ turnIndex: 'x', spokenMs: 100 }, undefined), null);
  assert.equal(resolveEarlyTurnEnd({ turnIndex: 0, spokenMs: -1 }, undefined), null);
  assert.equal(resolveEarlyTurnEnd({ turnIndex: 0, spokenMs: 'x' }, undefined), null);
  assert.equal(resolveEarlyTurnEnd({ turnIndex: 0, spokenMs: Infinity }, undefined), null);
});

test('resolveEarlyTurnEnd chốt lượt chưa từng kết thúc sớm', () => {
  assert.deepEqual(
    resolveEarlyTurnEnd({ turnIndex: 2, spokenMs: 20400.7 }, undefined),
    { turnIndex: 2, spokenMs: 20401, isNew: true }
  );
});

test('lượt đã chốt thì tin sau không kéo dài nó ra', () => {
  // Bấm lần hai, hoặc một tin tới muộn: phải nhận lại đúng con số đã chốt, và
  // không được phát lại cho cả phòng.
  assert.deepEqual(
    resolveEarlyTurnEnd({ turnIndex: 2, spokenMs: 30000 }, 20000),
    { turnIndex: 2, spokenMs: 20000, isNew: false }
  );
  assert.deepEqual(
    resolveEarlyTurnEnd({ turnIndex: 2, spokenMs: 20000 }, 20000),
    { turnIndex: 2, spokenMs: 20000, isNew: false }
  );
});

test('một con số ngắn hơn vẫn được chấp nhận', () => {
  // Chỉ có thể rút ngắn thêm. Trường hợp này hiếm nhưng vẫn nhất quán: lượt nói
  // không bao giờ dài ra.
  assert.deepEqual(
    resolveEarlyTurnEnd({ turnIndex: 2, spokenMs: 15000 }, 20000),
    { turnIndex: 2, spokenMs: 15000, isNew: true }
  );
});

test('end_turn_early ngoài phòng luyện thì không làm gì cả', () => {
  const { handlers, emitted } = createSocketHarness();

  handlers.end_turn_early({ turnIndex: 0, spokenMs: 12000 });
  handlers.device_declined();

  assert.equal(emitted.length, 0);
});

// --- Bam "Bat dau ghep" khi socket con dinh mot phong ---
//
// Nhanh nay tung la mot cau `return` im lang, va do la ly do nut "Bat dau ghep"
// trong nhu hong: client khong nhan duoc gi ca nen man hinh dung im.

test('phòng đã luyện xong thì thả ra để tìm bạn mới', () => {
  // Sau khi xem kết quả xong và bấm "Phiên mới": phòng vẫn còn nhưng chỉ là cái
  // vỏ. Chặn ở đây thì không ai bắt đầu phiên thứ hai được.
  assert.equal(resolveSearchWhileInRoom({ phase: 'done' }), 'release');
});

test('bản đồ phòng trỏ vào khoảng không thì cũng thả ra', () => {
  assert.equal(resolveSearchWhileInRoom(undefined), 'release');
  assert.equal(resolveSearchWhileInRoom(null), 'release');
});

test('phiên đang chạy thật thì chặn, để còn báo lý do', () => {
  for (const phase of ['devices', 'signaling', 'active']) {
    assert.equal(resolveSearchWhileInRoom({ phase }), 'block');
  }
});
