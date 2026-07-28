import assert from 'node:assert/strict';
import test from 'node:test';
import { setupSocket } from '../src/socket/index.js';

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
