// Realtime notification bridge on top of the shared Socket.IO connection.
//
// The socket connection is normally used for matchmaking/WebRTC. Here we reuse
// it to receive live "notification:new" pings so the lobby can update without a
// manual refresh. The server binds the socket to the signed-in account during
// the handshake, so there is nothing to announce from this side — we used to
// emit an 'identify' event with our own userId, which meant anyone could
// subscribe to another person's notifications by sending their id.
import { socket } from './socket';

const listeners = new Set();
let wired = false;

function handleNew(payload) {
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error('[Notifications] listener failed', err);
    }
  }
}

// Connect (if needed) and start relaying notification events.
// Safe to call repeatedly; wiring happens only once.
export function startNotificationsRealtime() {
  if (!wired) {
    wired = true;
    socket.on('notification:new', handleNew);
  }

  if (!socket.connected) {
    socket.connect();
  }
}

export function onNotification(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
