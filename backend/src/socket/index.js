import { randomUUID } from 'crypto';
import {
  createMatchedSession,
  markSessionAbandoned,
  markSessionActive,
} from '../models/sessionModel.js';

const MAX_BAND_DIFFERENCE = 1.0;

const waitingQueue = [];    // [{ socketId, displayName, band, joinedAt }]
const rooms = new Map();    // roomId -> { userA, userB, readyUsers: Set, sessionId }
const userRoom = new Map(); // socketId -> roomId

function removeFromQueue(socketId) {
  const idx = waitingQueue.findIndex((user) => user.socketId === socketId);

  if (idx !== -1) {
    waitingQueue.splice(idx, 1);
  }
}

function parseBand(band) {
  const parsedBand = Number.parseFloat(band);

  if (Number.isNaN(parsedBand) || parsedBand < 0 || parsedBand > 9) {
    return null;
  }

  return parsedBand;
}

function getBandDifference(userA, userB) {
  if (userA.band === null || userB.band === null) {
    return null;
  }

  return Math.abs(userA.band - userB.band);
}

function findBestBandMatch(user) {
  let bestMatch = null;

  for (const candidate of waitingQueue) {
    const bandDifference = getBandDifference(user, candidate);

    if (bandDifference === null || bandDifference > MAX_BAND_DIFFERENCE) {
      continue;
    }

    if (!bestMatch) {
      bestMatch = { user: candidate, bandDifference };
      continue;
    }

    const isCloserBand = bandDifference < bestMatch.bandDifference;
    const isSameBandDiffAndWaitingLonger =
      bandDifference === bestMatch.bandDifference &&
      candidate.joinedAt < bestMatch.user.joinedAt;

    if (isCloserBand || isSameBandDiffAndWaitingLonger) {
      bestMatch = { user: candidate, bandDifference };
    }
  }

  return bestMatch?.user || null;
}

function getPartnerSocketId(roomId, mySocketId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  return room.userA.socketId === mySocketId
    ? room.userB.socketId
    : room.userA.socketId;
}

function createRoom(roomId, userA, userB, sessionId) {
  rooms.set(roomId, { userA, userB, readyUsers: new Set(), sessionId });
  userRoom.set(userA.socketId, roomId);
  userRoom.set(userB.socketId, roomId);
}

function deleteRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  userRoom.delete(room.userA.socketId);
  userRoom.delete(room.userB.socketId);
  rooms.delete(roomId);
}

function emitMatched(io, userA, userB, roomId, session) {
  io.to(userA.socketId).emit('matched', {
    roomId,
    sessionId: session.sessionId,
    userId: session.userA.id,
    partnerId: session.userB.id,
    role: 'A',
    isInitiator: true,
    partnerName: userB.displayName,
  });

  io.to(userB.socketId).emit('matched', {
    roomId,
    sessionId: session.sessionId,
    userId: session.userB.id,
    partnerId: session.userA.id,
    role: 'B',
    isInitiator: false,
    partnerName: userA.displayName,
  });
}

async function handleFindMatch(io, socket, { displayName, band }) {
  if (userRoom.has(socket.id)) return;
  if (waitingQueue.some((user) => user.socketId === socket.id)) return;

  const user = {
    socketId: socket.id,
    displayName,
    band: parseBand(band),
    joinedAt: Date.now(),
  };

  const matchedUser = findBestBandMatch(user);

  if (matchedUser) {
    removeFromQueue(matchedUser.socketId);

    try {
      const roomId = randomUUID();
      const session = await createMatchedSession(roomId, matchedUser, user);
      createRoom(roomId, matchedUser, user, session.sessionId);
      emitMatched(io, matchedUser, user, roomId, session);

      console.log(
        `[Match] ${matchedUser.displayName} (${matchedUser.band}) matched with ${user.displayName} (${user.band}) | room: ${roomId}`
      );
    } catch (err) {
      waitingQueue.unshift(matchedUser);
      console.error('Failed to create matched session:', err.message);
      socket.emit('match_error', { error: err.message });
    }
    return;
  }

  waitingQueue.push(user);
  console.log(`[Queue] +${displayName} (${user.band}) | size: ${waitingQueue.length}`);
  socket.emit('waiting');
}

function handleCancelFindMatch(socket) {
  removeFromQueue(socket.id);
  console.log(`[Queue] -${socket.id} cancelled`);
}

function handleSignal(io, socket, data) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const partnerSocketId = getPartnerSocketId(roomId, socket.id);
  if (partnerSocketId) io.to(partnerSocketId).emit('signal', data);
}

async function handlePeerConnected(io, socket) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  room.readyUsers.add(socket.id);

  if (room.readyUsers.size === 2) {
    const timestamp = Date.now();
    await markSessionActive(room.sessionId);
    io.to(room.userA.socketId).emit('session_start', { timestamp });
    io.to(room.userB.socketId).emit('session_start', { timestamp });
    console.log(`[Session] Room ${roomId} started at ${timestamp}`);
  }
}

async function handleDisconnect(io, socket) {
  console.log(`[Socket] Disconnected: ${socket.id}`);
  removeFromQueue(socket.id);

  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const partnerSocketId = getPartnerSocketId(roomId, socket.id);
  if (partnerSocketId) io.to(partnerSocketId).emit('partner_disconnected');

  const room = rooms.get(roomId);
  if (room?.sessionId) {
    await markSessionAbandoned(room.sessionId);
  }

  deleteRoom(roomId);
}

export function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    socket.on('find_match', (data) => {
      handleFindMatch(io, socket, data).catch((err) => {
        console.error('find_match failed:', err.message);
        socket.emit('match_error', { error: 'Không thể tìm đối tác lúc này' });
      });
    });
    socket.on('cancel_find_match', () => handleCancelFindMatch(socket));
    socket.on('signal', (data) => handleSignal(io, socket, data));
    socket.on('peer_connected', () => {
      handlePeerConnected(io, socket).catch((err) => {
        console.error('peer_connected failed:', err.message);
      });
    });
    socket.on('disconnect', () => {
      handleDisconnect(io, socket).catch((err) => {
        console.error('disconnect handling failed:', err.message);
      });
    });
  });
}
