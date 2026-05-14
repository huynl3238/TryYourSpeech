import { randomUUID } from 'crypto';

// ─── State ────────────────────────────────────────────────────────────────────

const waitingQueue = [];    // [{ socketId, displayName }]
const rooms = new Map();    // roomId → { userA, userB, readyUsers: Set }
const userRoom = new Map(); // socketId → roomId

// ─── Helpers ──────────────────────────────────────────────────────────────────

function removeFromQueue(socketId) {
  const idx = waitingQueue.findIndex(u => u.socketId === socketId);
  if (idx !== -1) waitingQueue.splice(idx, 1);
}

function getPartnerSocketId(roomId, mySocketId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return room.userA.socketId === mySocketId
    ? room.userB.socketId
    : room.userA.socketId;
}

function createRoom(userA, userB) {
  const roomId = randomUUID();
  rooms.set(roomId, { userA, userB, readyUsers: new Set() });
  userRoom.set(userA.socketId, roomId);
  userRoom.set(userB.socketId, roomId);
  return roomId;
}

function deleteRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  userRoom.delete(room.userA.socketId);
  userRoom.delete(room.userB.socketId);
  rooms.delete(roomId);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleFindMatch(io, socket, { displayName }) {
  if (userRoom.has(socket.id)) return;
  if (waitingQueue.some(u => u.socketId === socket.id)) return;

  const user = { socketId: socket.id, displayName };
  waitingQueue.push(user);
  console.log(`[Queue] +${displayName} | size: ${waitingQueue.length}`);

  if (waitingQueue.length >= 2) {
    const userA = waitingQueue.shift(); // initiator
    const userB = waitingQueue.shift();
    const roomId = createRoom(userA, userB);

    io.to(userA.socketId).emit('matched', {
      roomId,
      isInitiator: true,
      partnerName: userB.displayName
    });
    io.to(userB.socketId).emit('matched', {
      roomId,
      isInitiator: false,
      partnerName: userA.displayName
    });

    console.log(`[Match] ${userA.displayName} ↔ ${userB.displayName} | room: ${roomId}`);
  } else {
    socket.emit('waiting');
  }
}

function handleCancelFindMatch(socket) {
  removeFromQueue(socket.id);
  console.log(`[Queue] -${socket.id} cancelled`);
}

// Relay thẳng signal WebRTC (offer / answer / ice-candidate) sang partner
function handleSignal(io, socket, data) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const partnerSocketId = getPartnerSocketId(roomId, socket.id);
  if (partnerSocketId) io.to(partnerSocketId).emit('signal', data);
}

// Client báo WebRTC P2P đã kết nối thành công
// Khi cả 2 báo xong → emit session_start với cùng 1 timestamp để sync timer
function handlePeerConnected(io, socket) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  room.readyUsers.add(socket.id);

  if (room.readyUsers.size === 2) {
    const timestamp = Date.now();
    io.to(room.userA.socketId).emit('session_start', { timestamp });
    io.to(room.userB.socketId).emit('session_start', { timestamp });
    console.log(`[Session] Room ${roomId} started at ${timestamp}`);
  }
}

function handleDisconnect(io, socket) {
  console.log(`[Socket] Disconnected: ${socket.id}`);
  removeFromQueue(socket.id);

  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const partnerSocketId = getPartnerSocketId(roomId, socket.id);
  if (partnerSocketId) io.to(partnerSocketId).emit('partner_disconnected');

  deleteRoom(roomId);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    socket.on('find_match', (data) => handleFindMatch(io, socket, data));
    socket.on('cancel_find_match', () => handleCancelFindMatch(socket));
    socket.on('signal', (data) => handleSignal(io, socket, data));
    socket.on('peer_connected', () => handlePeerConnected(io, socket));
    socket.on('disconnect', () => handleDisconnect(io, socket));
  });
}