import assert from 'node:assert/strict';
import test from 'node:test';
import { setupSocket } from '../src/socket/index.js';
import {
  setIo,
  registerUserSocket,
  unregisterSocket,
  emitToUser,
} from '../src/socket/notifier.js';

// Fake io that records every `.to(socketId).emit(event, payload)` call so we
// can assert which sockets a realtime notification reached.
function createRecordingIo() {
  const delivered = [];
  const io = {
    on() {},
    to(socketId) {
      return {
        emit(event, payload) {
          delivered.push({ socketId, event, payload });
        },
      };
    },
  };
  return { io, delivered };
}

test('emitToUser delivers to every socket registered for the user', () => {
  const { io, delivered } = createRecordingIo();
  setIo(io);

  registerUserSocket('user-a', 'sock-1');
  registerUserSocket('user-a', 'sock-2');
  registerUserSocket('user-b', 'sock-3');

  emitToUser('user-a', 'notification:new', { title: 'Hi' });

  const targets = delivered.filter((d) => d.event === 'notification:new').map((d) => d.socketId).sort();
  assert.deepEqual(targets, ['sock-1', 'sock-2']);
  assert.equal(delivered.every((d) => d.payload.title === 'Hi'), true);

  unregisterSocket('sock-1');
  unregisterSocket('sock-2');
  unregisterSocket('sock-3');
});

test('emitToUser does not deliver to an unknown or disconnected user', () => {
  const { io, delivered } = createRecordingIo();
  setIo(io);

  registerUserSocket('user-c', 'sock-9');
  unregisterSocket('sock-9');

  emitToUser('user-c', 'notification:new', { title: 'x' });
  emitToUser('user-nobody', 'notification:new', { title: 'y' });

  assert.equal(delivered.length, 0);
});

// The socket is bound to its user at handshake time now, so simply connecting
// is enough to receive that user's notifications — there is no 'identify' event
// a client could use to subscribe to somebody else's feed.
test('a connected socket receives its own user notifications', () => {
  const { io, delivered } = createRecordingIo();
  const handlers = {};
  const socket = {
    id: 'sock-identify',
    data: { user: { id: 'user-d', displayName: 'D', band: 6, userRole: 'student' } },
    on(event, handler) {
      handlers[event] = handler;
    },
    emit() {},
  };
  // Drive a single connection through setupSocket, then re-point the notifier
  // at our recording io (setupSocket also calls setIo internally).
  setupSocket({
    use() {},
    on(event, handler) {
      if (event === 'connection') handler(socket);
    },
    to() {
      return { emit() {} };
    },
  });
  setIo(io);

  emitToUser('user-d', 'notification:new', { title: 'ping' });

  const hit = delivered.find((d) => d.socketId === 'sock-identify' && d.event === 'notification:new');
  assert.ok(hit, 'expected the identified socket to receive notification:new');
  assert.equal(hit.payload.title, 'ping');

  handlers.disconnect?.();
  unregisterSocket('sock-identify');
});
