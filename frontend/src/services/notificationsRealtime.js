// Realtime notification bridge on top of the shared Socket.IO connection.
//
// The socket connection is normally used for matchmaking/WebRTC. Here we reuse
// it to receive live "notification:new" pings so the lobby can update without a
// manual refresh. We identify the current device's userId to the server so it
// knows which sockets belong to us, and re-identify on every (re)connect.
import { socket } from './socket';
import { getIdentity } from '../utils/identity';

const listeners = new Set();
let wired = false;

function emitIdentify() {
  const userId = getIdentity()?.userId;
  if (userId && socket.connected) {
    socket.emit('identify', { userId });
  }
}

function handleNew(payload) {
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error('[Notifications] listener failed', err);
    }
  }
}

// Connect (if needed), identify, and start relaying notification events.
// Safe to call repeatedly; wiring happens only once.
export function startNotificationsRealtime() {
  if (!wired) {
    wired = true;
    socket.on('connect', emitIdentify);
    socket.on('notification:new', handleNew);
  }

  if (!socket.connected) {
    socket.connect();
  } else {
    emitIdentify();
  }
}

export function onNotification(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
