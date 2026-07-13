import assert from 'node:assert/strict';
import test from 'node:test';
import { setupSocket } from '../src/socket/index.js';

function createSocketHarness() {
  const handlers = {};
  const emitted = [];
  const socket = {
    id: `socket-${Math.random()}`,
    on(event, handler) {
      handlers[event] = handler;
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
  };
  const io = {
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

  return { handlers, emitted };
}

test('find_match rejects invalid payloads with match_error', async () => {
  const { handlers, emitted } = createSocketHarness();

  await handlers.find_match({ displayName: 'An', band: 'bad' });
  await handlers.find_match({ displayName: 'An', band: '   ' });
  await handlers.find_match({ displayName: '   ', band: 6 });
  await handlers.find_match(null);

  assert.equal(emitted.length, 4);
  assert.deepEqual(
    emitted.map((item) => item.event),
    ['match_error', 'match_error', 'match_error', 'match_error']
  );
});

test('find_match accepts valid payloads and enters waiting state', async () => {
  const { handlers, emitted } = createSocketHarness();

  await handlers.find_match({ displayName: '  An  ', band: '6.5' });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, 'waiting');
});

test('find_match accepts mentor mode users into mentor queues', async () => {
  const mentorHarness = createSocketHarness();
  await mentorHarness.handlers.find_match({
    displayName: 'Mentor Linh',
    mode: 'mentor',
    userRole: 'mentor',
  });

  assert.equal(mentorHarness.emitted.length, 1);
  assert.equal(mentorHarness.emitted[0].event, 'waiting');
  mentorHarness.handlers.cancel_find_match();

  const studentHarness = createSocketHarness();
  await studentHarness.handlers.find_match({
    displayName: 'Student An',
    band: 5.5,
    mode: 'mentor',
    userRole: 'student',
  });

  assert.equal(studentHarness.emitted.length, 1);
  assert.equal(studentHarness.emitted[0].event, 'waiting');
  studentHarness.handlers.cancel_find_match();
});

test('find_match rejects mentor role in peer mode', async () => {
  const { handlers, emitted } = createSocketHarness();

  await handlers.find_match({
    displayName: 'Mentor Bao',
    band: 7,
    userRole: 'mentor',
  });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, 'match_error');
});
