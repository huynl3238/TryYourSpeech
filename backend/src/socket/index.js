import { randomUUID } from 'crypto';
import {
  createMatchedSession,
  getMentorRoomParticipants,
  markSessionAbandoned,
  markSessionActive,
} from '../models/sessionModel.js';
import { setIo, registerUserSocket, unregisterSocket } from './notifier.js';

const MAX_BAND_DIFFERENCE = 1.0;
const MAX_DISPLAY_NAME_LENGTH = 100;
const READY_WAIT_TIMEOUT_MS = 60000;
const SIGNAL_TYPES = new Set(['offer', 'answer', 'ice-candidate']);
const SESSION_MODES = new Set(['peer', 'mentor']);
const USER_ROLES = new Set(['student', 'mentor']);

const waitingQueue = [];
const mentorQueue = [];
const mentorStudentQueue = [];
const rooms = new Map();
const userRoom = new Map();
// sessionId -> { A: userInfo|null, B: userInfo|null } for REST-started mentor
// sessions where both parties join the realtime room explicitly.
const mentorRoomWaiters = new Map();

function removeFromQueue(socketId) {
  for (const queue of [waitingQueue, mentorQueue, mentorStudentQueue]) {
    const idx = queue.findIndex((user) => user.socketId === socketId);

    if (idx !== -1) {
      queue.splice(idx, 1);
    }
  }
}

function isSocketQueued(socketId) {
  return [waitingQueue, mentorQueue, mentorStudentQueue].some((queue) =>
    queue.some((user) => user.socketId === socketId)
  );
}

function parseBand(band) {
  if (band === null || band === undefined || band === '') {
    return null;
  }

  if (typeof band === 'string' && band.trim().length === 0) {
    return null;
  }

  const parsedBand = Number(band);

  if (!Number.isFinite(parsedBand) || parsedBand < 0 || parsedBand > 9) {
    return null;
  }

  return parsedBand;
}

function normalizeDisplayName(displayName) {
  if (typeof displayName !== 'string') {
    return null;
  }

  const trimmedName = displayName.trim();

  if (trimmedName.length === 0 || trimmedName.length > MAX_DISPLAY_NAME_LENGTH) {
    return null;
  }

  return trimmedName;
}

function parseSessionMode(mode) {
  if (mode === null || mode === undefined || mode === '') {
    return 'peer';
  }

  if (typeof mode !== 'string' || !SESSION_MODES.has(mode)) {
    return null;
  }

  return mode;
}

function parseUserRole(userRole, sessionMode) {
  if (userRole === null || userRole === undefined || userRole === '') {
    return 'student';
  }

  if (typeof userRole !== 'string' || !USER_ROLES.has(userRole)) {
    return null;
  }

  if (sessionMode === 'peer' && userRole !== 'student') {
    return null;
  }

  return userRole;
}

function validateMatchRequest(data) {
  if (!data || typeof data !== 'object') {
    return { error: 'Thong tin tim doi tac khong hop le' };
  }

  const displayName = normalizeDisplayName(data.displayName);
  if (!displayName) {
    return { error: 'Ten hien thi khong hop le' };
  }

  const sessionMode = parseSessionMode(data.mode);
  if (!sessionMode) {
    return { error: 'Che do ghep cap khong hop le' };
  }

  const userRole = parseUserRole(data.userRole, sessionMode);
  if (!userRole) {
    return { error: 'Vai tro nguoi dung khong hop le' };
  }

  const band = data.band === undefined && userRole === 'mentor'
    ? null
    : parseBand(data.band);

  if (band === null && userRole === 'student') {
    return { error: 'Band hien tai phai la so tu 0 den 9' };
  }

  if (band === null && data.band !== undefined && userRole === 'mentor') {
    return { error: 'Band hien tai phai la so tu 0 den 9' };
  }

  return { displayName, band, sessionMode, userRole };
}

function isValidSignal(data) {
  return (
    data &&
    typeof data === 'object' &&
    SIGNAL_TYPES.has(data.type) &&
    Object.prototype.hasOwnProperty.call(data, 'payload')
  );
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

function takeOldestUser(queue) {
  if (queue.length === 0) {
    return null;
  }

  queue.sort((a, b) => a.joinedAt - b.joinedAt);
  return queue.shift();
}

function getPartnerSocketId(roomId, mySocketId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  return room.userA.socketId === mySocketId
    ? room.userB.socketId
    : room.userA.socketId;
}

function createRoom(roomId, userA, userB, sessionId, sessionMode) {
  rooms.set(roomId, {
    userA,
    userB,
    sessionMode,
    readyUsers: new Set(),
    practiceReadyUsers: new Set(),
    practiceStarted: false,
    sessionId,
    readyTimeout: null,
  });
  userRoom.set(userA.socketId, roomId);
  userRoom.set(userB.socketId, roomId);
}

function deleteRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.readyTimeout) {
    clearTimeout(room.readyTimeout);
  }

  userRoom.delete(room.userA.socketId);
  userRoom.delete(room.userB.socketId);
  rooms.delete(roomId);
}

async function abandonRoom(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  io.to(room.userA.socketId).emit('partner_disconnected');
  io.to(room.userB.socketId).emit('partner_disconnected');

  if (room.sessionId) {
    await markSessionAbandoned(room.sessionId);
  }

  deleteRoom(roomId);
}

function emitMatched(io, userA, userB, roomId, session, sessionMode) {
  io.to(userA.socketId).emit('matched', {
    roomId,
    sessionId: session.sessionId,
    userId: session.userA.id,
    partnerId: session.userB.id,
    role: 'A',
    isInitiator: true,
    partnerName: userB.displayName,
    sessionMode,
    myUserRole: userA.userRole,
    partnerUserRole: userB.userRole,
  });

  io.to(userB.socketId).emit('matched', {
    roomId,
    sessionId: session.sessionId,
    userId: session.userB.id,
    partnerId: session.userA.id,
    role: 'B',
    isInitiator: false,
    partnerName: userA.displayName,
    sessionMode,
    myUserRole: userB.userRole,
    partnerUserRole: userA.userRole,
  });
}

function emitPracticeReadyState(io, room) {
  const userAReady = room.practiceReadyUsers.has(room.userA.socketId);
  const userBReady = room.practiceReadyUsers.has(room.userB.socketId);

  io.to(room.userA.socketId).emit('practice_ready_state', {
    readyCount: room.practiceReadyUsers.size,
    total: 2,
    myReady: userAReady,
    partnerReady: userBReady,
  });

  io.to(room.userB.socketId).emit('practice_ready_state', {
    readyCount: room.practiceReadyUsers.size,
    total: 2,
    myReady: userBReady,
    partnerReady: userAReady,
  });
}

function createMatchUser(socket, matchRequest) {
  return {
    socketId: socket.id,
    displayName: matchRequest.displayName,
    band: matchRequest.band,
    userRole: matchRequest.userRole,
    joinedAt: Date.now(),
  };
}

async function createPeerMatch(io, socket, user, matchedUser) {
  removeFromQueue(matchedUser.socketId);

  try {
    const roomId = randomUUID();
    const session = await createMatchedSession(roomId, matchedUser, user, 'peer');
    createRoom(roomId, matchedUser, user, session.sessionId, 'peer');
    emitMatched(io, matchedUser, user, roomId, session, 'peer');

    console.log(
      `[Match] ${matchedUser.displayName} (${matchedUser.band}) matched with ${user.displayName} (${user.band}) | room: ${roomId}`
    );
  } catch (err) {
    waitingQueue.unshift(matchedUser);
    console.error('Failed to create matched session:', err.message);
    socket.emit('match_error', { error: err.message });
  }
}

async function createMentorMatch(io, student, mentor) {
  try {
    const roomId = randomUUID();
    const session = await createMatchedSession(roomId, student, mentor, 'mentor');
    createRoom(roomId, student, mentor, session.sessionId, 'mentor');
    emitMatched(io, student, mentor, roomId, session, 'mentor');

    console.log(
      `[MentorMatch] ${student.displayName} (${student.band}) matched with ${mentor.displayName} | room: ${roomId}`
    );
  } catch (err) {
    mentorStudentQueue.unshift(student);
    mentorQueue.unshift(mentor);
    console.error('Failed to create mentor session:', err.message);
    io.to(student.socketId).emit('match_error', { error: err.message });
    io.to(mentor.socketId).emit('match_error', { error: err.message });
  }
}

async function handleFindMentorMatch(io, socket, user) {
  if (user.userRole === 'mentor') {
    const student = takeOldestUser(mentorStudentQueue);
    if (student) {
      await createMentorMatch(io, student, user);
      return;
    }

    mentorQueue.push(user);
    console.log(`[MentorQueue] +${user.displayName} | size: ${mentorQueue.length}`);
    socket.emit('waiting');
    return;
  }

  const mentor = takeOldestUser(mentorQueue);
  if (mentor) {
    await createMentorMatch(io, user, mentor);
    return;
  }

  mentorStudentQueue.push(user);
  console.log(`[MentorStudentQueue] +${user.displayName} (${user.band}) | size: ${mentorStudentQueue.length}`);
  socket.emit('waiting');
}

async function handleFindMatch(io, socket, data) {
  if (userRoom.has(socket.id)) return;
  if (isSocketQueued(socket.id)) return;

  const matchRequest = validateMatchRequest(data);
  if (matchRequest.error) {
    socket.emit('match_error', { error: matchRequest.error });
    return;
  }

  const user = createMatchUser(socket, matchRequest);

  if (matchRequest.sessionMode === 'mentor') {
    await handleFindMentorMatch(io, socket, user);
    return;
  }

  const matchedUser = findBestBandMatch(user);
  if (matchedUser) {
    await createPeerMatch(io, socket, user, matchedUser);
    return;
  }

  waitingQueue.push(user);
  console.log(`[Queue] +${user.displayName} (${user.band}) | size: ${waitingQueue.length}`);
  socket.emit('waiting');
}

function handleCancelFindMatch(socket) {
  removeFromQueue(socket.id);
  console.log(`[Queue] -${socket.id} cancelled`);
}

function handleSignal(io, socket, data) {
  if (!isValidSignal(data)) {
    console.warn(`[Signal] Invalid signal from ${socket.id}`);
    return;
  }

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
    if (room.readyTimeout) {
      clearTimeout(room.readyTimeout);
      room.readyTimeout = null;
    }

    const timestamp = Date.now();
    await markSessionActive(room.sessionId);
    io.to(room.userA.socketId).emit('session_start', { timestamp });
    io.to(room.userB.socketId).emit('session_start', { timestamp });
    console.log(`[Session] Room ${roomId} started at ${timestamp}`);
    return;
  }

  if (!room.readyTimeout) {
    room.readyTimeout = setTimeout(() => {
      abandonRoom(io, roomId).catch((err) => {
        console.error('ready timeout handling failed:', err.message);
      });
    }, READY_WAIT_TIMEOUT_MS);
    room.readyTimeout.unref?.();
  }
}

function handlePracticeReady(io, socket) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.readyUsers.size < 2) return;

  room.practiceReadyUsers.add(socket.id);
  emitPracticeReadyState(io, room);

  if (room.practiceReadyUsers.size === 2 && !room.practiceStarted) {
    room.practiceStarted = true;
    const timestamp = Date.now();
    io.to(room.userA.socketId).emit('practice_start', { timestamp });
    io.to(room.userB.socketId).emit('practice_start', { timestamp });
    console.log(`[Session] Room ${roomId} practice started at ${timestamp}`);
  }
}

function cleanupMentorWaiter(socketId) {
  for (const [sessionId, waiter] of mentorRoomWaiters) {
    let changed = false;
    for (const role of ['A', 'B']) {
      if (waiter[role]?.socketId === socketId) {
        waiter[role] = null;
        changed = true;
      }
    }
    if (changed && !waiter.A && !waiter.B) {
      mentorRoomWaiters.delete(sessionId);
    }
  }
}

// A mentor picked a student via REST (session already created in DB). Both the
// mentor and the chosen student emit join_mentor_room; once both are present we
// build the realtime room and reuse the normal matched -> session_start flow.
async function handleJoinMentorRoom(io, socket, data) {
  if (userRoom.has(socket.id)) return;

  const sessionId = data && typeof data.sessionId === 'string' ? data.sessionId : null;
  const userId = data && typeof data.userId === 'string' ? data.userId : null;
  if (!sessionId || !userId) {
    socket.emit('match_error', { error: 'Thong tin phien khong hop le' });
    return;
  }

  let participants;
  try {
    participants = await getMentorRoomParticipants(sessionId);
  } catch (err) {
    console.error('getMentorRoomParticipants failed:', err.message);
    socket.emit('match_error', { error: 'Khong the vao phong luc nay' });
    return;
  }

  if (!participants || participants.sessionMode !== 'mentor') {
    socket.emit('match_error', { error: 'Khong tim thay phien hoc' });
    return;
  }

  if (participants.status === 'completed' || participants.status === 'abandoned') {
    socket.emit('match_error', { error: 'Phien hoc da ket thuc' });
    return;
  }

  let role;
  if (userId === participants.userA.id) role = 'A';
  else if (userId === participants.userB.id) role = 'B';
  else {
    socket.emit('match_error', { error: 'Ban khong thuoc phien hoc nay' });
    return;
  }

  // Reconnect is not supported in the MVP, so fail loudly instead of leaving
  // this client waiting forever.
  if (rooms.has(participants.roomId)) {
    socket.emit('match_error', { error: 'Phiên học đang có kết nối khác. Vui lòng tải lại danh sách phiên.' });
    return;
  }

  const waiter = mentorRoomWaiters.get(sessionId) || { A: null, B: null };
  if (waiter[role]?.socketId && waiter[role].socketId !== socket.id) {
    io.to(waiter[role].socketId).emit('match_error', {
      error: 'Phiên học đã được mở ở một tab khác.',
    });
  }
  waiter[role] = {
    socketId: socket.id,
    displayName: role === 'A' ? participants.userA.displayName : participants.userB.displayName,
    band: role === 'A' ? participants.userA.band : participants.userB.band,
    userRole: role === 'A' ? participants.userA.userRole : participants.userB.userRole,
    joinedAt: Date.now(),
  };
  mentorRoomWaiters.set(sessionId, waiter);

  if (!waiter.A || !waiter.B) {
    socket.emit('waiting');
    return;
  }

  mentorRoomWaiters.delete(sessionId);
  createRoom(participants.roomId, waiter.A, waiter.B, sessionId, 'mentor');
  emitMatched(
    io,
    waiter.A,
    waiter.B,
    participants.roomId,
    { sessionId, userA: { id: participants.userA.id }, userB: { id: participants.userB.id } },
    'mentor'
  );
  console.log(`[MentorRoom] Session ${sessionId} joined by both | room: ${participants.roomId}`);
}

async function handleDisconnect(io, socket) {
  console.log(`[Socket] Disconnected: ${socket.id}`);
  removeFromQueue(socket.id);
  cleanupMentorWaiter(socket.id);
  unregisterSocket(socket.id);

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

// Realtime snapshot for the admin dashboard. Reads the in-memory matchmaking
// state (not stored in the DB) so admins can see who is waiting / practising now.
export function getLiveStats() {
  return {
    waitingPeer: waitingQueue.length,
    waitingMentor: mentorQueue.length + mentorStudentQueue.length,
    activeRooms: rooms.size,
  };
}

export function setupSocket(io) {
  setIo(io);

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Associate this socket with a signed-in user so we can push realtime
    // notifications to them regardless of matchmaking state.
    socket.on('identify', (data) => {
      const userId = data && typeof data.userId === 'string' ? data.userId.trim() : '';
      if (userId) {
        registerUserSocket(userId, socket.id);
      }
    });

    socket.on('find_match', (data) => {
      handleFindMatch(io, socket, data).catch((err) => {
        console.error('find_match failed:', err.message);
        socket.emit('match_error', { error: 'Khong the tim doi tac luc nay' });
      });
    });
    socket.on('cancel_find_match', () => handleCancelFindMatch(socket));
    socket.on('signal', (data) => handleSignal(io, socket, data));
    socket.on('peer_connected', () => {
      handlePeerConnected(io, socket).catch((err) => {
        console.error('peer_connected failed:', err.message);
      });
    });
    socket.on('practice_ready', () => handlePracticeReady(io, socket));
    socket.on('join_mentor_room', (data) => {
      handleJoinMentorRoom(io, socket, data).catch((err) => {
        console.error('join_mentor_room failed:', err.message);
        socket.emit('match_error', { error: 'Khong the vao phong hoc luc nay' });
      });
    });
    socket.on('disconnect', () => {
      handleDisconnect(io, socket).catch((err) => {
        console.error('disconnect handling failed:', err.message);
      });
    });
  });
}
