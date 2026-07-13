// Bridges DB-side notification creation to realtime Socket.IO delivery.
// Keeps a userId -> Set<socketId> registry that is independent of the
// matchmaking/room state, so any signed-in client (even sitting on the lobby)
// can receive a live "you have a new notification" ping.
//
// This module intentionally imports nothing from models, so models can import
// it without creating a circular dependency.

let ioRef = null;
const userSockets = new Map(); // userId -> Set<socketId>
const socketUser = new Map(); // socketId -> userId

export function setIo(io) {
  ioRef = io;
}

export function registerUserSocket(userId, socketId) {
  if (!userId || !socketId) return;

  // If this socket was previously registered to a different user, drop it there.
  const previous = socketUser.get(socketId);
  if (previous && previous !== userId) {
    unregisterSocket(socketId);
  }

  socketUser.set(socketId, userId);
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);
}

export function unregisterSocket(socketId) {
  const userId = socketUser.get(socketId);
  if (!userId) return;

  socketUser.delete(socketId);
  const set = userSockets.get(userId);
  if (set) {
    set.delete(socketId);
    if (set.size === 0) {
      userSockets.delete(userId);
    }
  }
}

export function emitToUser(userId, event, payload) {
  if (!ioRef || !userId) return;

  const set = userSockets.get(userId);
  if (!set || set.size === 0) return;

  for (const socketId of set) {
    ioRef.to(socketId).emit(event, payload);
  }
}
