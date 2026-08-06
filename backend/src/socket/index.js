import { randomUUID } from 'crypto';
import {
  createMatchedSession,
  getMentorRoomParticipants,
  markSessionAbandoned,
  markSessionActive,
} from '../models/sessionModel.js';
import { setIo, registerUserSocket, unregisterSocket } from './notifier.js';
import { authenticateSocket } from './auth.js';

const MAX_BAND_DIFFERENCE = 1.0;
const MAX_DISPLAY_NAME_LENGTH = 100;
const READY_WAIT_TIMEOUT_MS = 60000;
const CONNECT_WAIT_TIMEOUT_MS = 45000;
const SIGNAL_TYPES = new Set(['offer', 'answer', 'ice-candidate']);
const SESSION_MODES = new Set(['peer', 'mentor']);
const USER_ROLES = new Set(['student', 'mentor']);

const waitingQueue = [];
const mentorQueue = [];
const mentorStudentQueue = [];
const rooms = new Map();
const userRoom = new Map();
// Every socket currently connected. See isSocketAlive for why this is tracked
// here instead of being read out of Socket.IO.
const connectedSockets = new Set();
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

function isUserQueued(userId) {
  return [waitingQueue, mentorQueue, mentorStudentQueue].some((queue) =>
    queue.some((user) => user.userId === userId)
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

// `account` is the signed-in user resolved at handshake time. Display name and
// role come from it, never from the payload — the client only gets to choose the
// band it wants to be matched at and which mode it is joining.
function validateMatchRequest(data, account) {
  if (!data || typeof data !== 'object') {
    return { error: 'Thong tin tim doi tac khong hop le' };
  }

  const displayName = normalizeDisplayName(account.displayName);
  if (!displayName) {
    return { error: 'Ten hien thi khong hop le' };
  }

  const sessionMode = parseSessionMode(data.mode);
  if (!sessionMode) {
    return { error: 'Che do ghep cap khong hop le' };
  }

  const userRole = parseUserRole(account.userRole === 'admin' ? 'mentor' : account.userRole, sessionMode);
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

// Whether a socket is still connected right now. Matching straddles an await on
// the database, and someone can close their tab inside that window — the queue
// entry and the room both outlive the person if nobody checks.
//
// Kept as our own set rather than read off io.sockets.sockets: that is Socket.IO
// internals, and reaching into them makes this module depend on the shape of
// something we do not own and cannot exercise from a test.
function isSocketAlive(socketId) {
  return connectedSockets.has(socketId);
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

// A room walks through four phases:
//   devices    both sides are still checking mic/camera
//   signaling  both pressed ready; offer/answer/ICE are in flight
//   active     WebRTC really connected, the practice timeline is running
//   done       practice finished, the pair moved on to writing their reviews
//
// The phase exists because a lost socket means something different in each one.
// During `signaling` it is a failed match; during `done` it means nothing at all
// and must not touch the session.
function createRoom(roomId, userA, userB, sessionId, sessionMode) {
  rooms.set(roomId, {
    userA,
    userB,
    sessionMode,
    phase: 'devices',
    deviceReadyUsers: new Set(),
    connectedUsers: new Set(),
    practiceCompleteUsers: new Set(),
    practiceReadyUsers: new Set(),
    practiceStarted: false,
    sessionId,
    readyTimeout: null,
    connectTimeout: null,
  });
  userRoom.set(userA.socketId, roomId);
  userRoom.set(userB.socketId, roomId);
}

function clearRoomTimers(room) {
  if (room.readyTimeout) {
    clearTimeout(room.readyTimeout);
    room.readyTimeout = null;
  }

  if (room.connectTimeout) {
    clearTimeout(room.connectTimeout);
    room.connectTimeout = null;
  }
}

function deleteRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  clearRoomTimers(room);
  userRoom.delete(room.userA.socketId);
  userRoom.delete(room.userB.socketId);
  rooms.delete(roomId);
}

// The single exit for every failure that ends a room before the practice is
// over. `reason` is the event name the clients receive, and it has to name what
// actually happened: sending `partner_disconnected` for a ready timeout or a
// broken microphone had people hunting a network fault that was never there.
//
// The room is removed *before* the await on purpose. Emitting first and deleting
// after left a window where a `peer_connected` arriving mid-await still found
// the room and started the session, so both clients got `partner_disconnected`
// and `session_start` for the same room.
async function closeRoom(io, roomId, reason, { skipSocketId = null } = {}) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const socketId of [room.userA.socketId, room.userB.socketId]) {
    if (socketId !== skipSocketId) {
      io.to(socketId).emit(reason);
    }
  }

  deleteRoom(roomId);

  if (room.sessionId) {
    await markSessionAbandoned(room.sessionId);
  }
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
    userId: socket.data.user.id,
    displayName: matchRequest.displayName,
    band: matchRequest.band,
    userRole: matchRequest.userRole,
    joinedAt: Date.now(),
  };
}

// Puts someone back in the peer queue after a match fell through. Silently drops
// anyone who has since disconnected: an entry for a dead socket is a trap for
// the next arrival, who gets matched with nobody and waits out the ready timeout.
function requeueUser(io, user) {
  if (!isSocketAlive(user.socketId)) return false;
  if (isSocketQueued(user.socketId) || isUserQueued(user.userId)) return false;

  waitingQueue.push(user);
  io.to(user.socketId).emit('waiting');
  return true;
}

// Matching normally only runs when somebody new calls find_match. That is enough
// in the happy path, but not after a failed match hands two people back to the
// queue: they can be a perfect fit for each other and still wait forever,
// because no new arrival is coming to trigger the search. This pairs off whoever
// is already waiting.
let sweepInProgress = false;

async function sweepWaitingQueue(io) {
  // createPeerMatch can call back in here through its own failure path; without
  // this the two would bounce off each other until the stack ran out.
  if (sweepInProgress) return;
  sweepInProgress = true;

  try {
    for (;;) {
      // Drop the dead before pairing, so a stale entry cannot be handed out.
      for (const entry of [...waitingQueue]) {
        if (!isSocketAlive(entry.socketId)) {
          removeFromQueue(entry.socketId);
        }
      }

      const candidate = waitingQueue[0];
      if (!candidate) return;

      // Taken out first: findBestBandMatch scans the queue and would otherwise
      // happily return the candidate themselves.
      removeFromQueue(candidate.socketId);
      const partner = findBestBandMatch(candidate);
      if (!partner) {
        waitingQueue.unshift(candidate);
        return;
      }

      // Stop on anything that did not produce a room. Both failure paths put
      // people back in the queue, so carrying on would pick the very same pair
      // and fail on it again — a database that stays down would spin here
      // forever. The next find_match will retry naturally.
      const matched = await createPeerMatch(io, candidate, partner);
      if (!matched) return;
    }
  } finally {
    sweepInProgress = false;
  }
}

// `user` is the person who just asked and is not in the queue; `matchedUser` is
// the person taken out of it. Neither is queued while this runs.
async function createPeerMatch(io, user, matchedUser) {
  removeFromQueue(matchedUser.socketId);

  const roomId = randomUUID();
  let session = null;

  try {
    session = await createMatchedSession(roomId, matchedUser, user, 'peer');
  } catch (err) {
    console.error('Failed to create matched session:', err.message);
    // Both go back, not just the one who was waiting. The person who asked used
    // to be dropped with an error and had to press the button again, which is a
    // strange thing to ask of someone whose only mistake was arriving while the
    // database hiccuped.
    for (const person of [matchedUser, user]) {
      if (!requeueUser(io, person)) {
        io.to(person.socketId).emit('match_error', { error: err.message });
      }
    }
    return false;
  }

  // The insert above is a real round trip and either person can close their tab
  // during it. Building a room around a socket that is already gone leaves the
  // other one sitting on the device check until the 60s ready timeout, and only
  // then is the session marked abandoned.
  const gone = [matchedUser, user].filter((person) => !isSocketAlive(person.socketId));
  if (gone.length > 0) {
    await markSessionAbandoned(session.sessionId);
    console.warn(`[Match] Dropped room ${roomId}: ${gone.length} người đã rời trước khi ghép xong`);

    for (const person of [matchedUser, user]) {
      requeueUser(io, person);
    }

    await sweepWaitingQueue(io);
    return false;
  }

  createRoom(roomId, matchedUser, user, session.sessionId, 'peer');
  emitMatched(io, matchedUser, user, roomId, session, 'peer');

  console.log(
    `[Match] ${matchedUser.displayName} (${matchedUser.band}) matched with ${user.displayName} (${user.band}) | room: ${roomId}`
  );

  return true;
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

  const matchRequest = validateMatchRequest(data, socket.data.user);
  if (matchRequest.error) {
    socket.emit('match_error', { error: matchRequest.error });
    return;
  }

  // Two tabs signed into the same account would otherwise be matched with each
  // other, creating a session where both sides are the same person.
  if (isUserQueued(socket.data.user.id)) {
    socket.emit('match_error', { error: 'Tài khoản của bạn đang tìm đối tác ở một tab khác' });
    return;
  }

  const user = createMatchUser(socket, matchRequest);

  if (matchRequest.sessionMode === 'mentor') {
    await handleFindMentorMatch(io, socket, user);
    return;
  }

  const matchedUser = findBestBandMatch(user);
  if (matchedUser) {
    await createPeerMatch(io, user, matchedUser);
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

// Someone pressed "I'm ready" on the device check. This only means their mic and
// camera work — nothing has been negotiated yet, which is why it no longer starts
// the session on its own.
function handleDeviceReady(io, socket) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.phase !== 'devices') return;

  room.deviceReadyUsers.add(socket.id);

  if (room.deviceReadyUsers.size < 2) {
    if (!room.readyTimeout) {
      room.readyTimeout = setTimeout(() => {
        closeRoom(io, roomId, 'partner_not_ready').catch((err) => {
          console.error('ready timeout handling failed:', err.message);
        });
      }, READY_WAIT_TIMEOUT_MS);
      room.readyTimeout.unref?.();
    }
    return;
  }

  clearRoomTimers(room);
  room.phase = 'signaling';
  io.to(room.userA.socketId).emit('begin_signaling');
  io.to(room.userB.socketId).emit('begin_signaling');

  room.connectTimeout = setTimeout(() => {
    closeRoom(io, roomId, 'webrtc_failed').catch((err) => {
      console.error('connect timeout handling failed:', err.message);
    });
  }, CONNECT_WAIT_TIMEOUT_MS);
  room.connectTimeout.unref?.();
}

// WebRTC has actually reached `connected` on this client. Only now is the media
// link real, so only now may the session clock start. It used to fire on the
// ready button, which meant the server called a session active while the two
// browsers had not exchanged a single packet.
async function handlePeerConnected(io, socket) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.phase !== 'signaling') return;

  room.connectedUsers.add(socket.id);
  if (room.connectedUsers.size < 2) return;

  clearRoomTimers(room);
  room.phase = 'active';

  const timestamp = Date.now();
  await markSessionActive(room.sessionId);
  io.to(room.userA.socketId).emit('session_start', { timestamp });
  io.to(room.userB.socketId).emit('session_start', { timestamp });
  console.log(`[Session] Room ${roomId} started at ${timestamp}`);
}

// This client's microphone or camera could not be opened. The person it happened
// to is already looking at a screen explaining it, so only the partner is told —
// and told the real reason instead of being sent to debug their own connection.
function handleDeviceFailed(io, socket) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.phase === 'done') return;

  closeRoom(io, roomId, 'partner_device_failed', { skipSocketId: socket.id }).catch((err) => {
    console.error('device_failed handling failed:', err.message);
  });
}

// The practice timeline finished and both sides are heading for the review
// phase. Marking the room done is what stops a later disconnect — closing the
// tab, hitting refresh, or starting a new search — from abandoning a session
// whose practice actually succeeded and whose AI results are still owed.
function handlePracticeComplete(socket) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.phase = 'done';
  clearRoomTimers(room);
  room.practiceCompleteUsers.add(socket.id);

  if (room.practiceCompleteUsers.size === 2) {
    console.log(`[Session] Room ${roomId} finished practice`);
    deleteRoom(roomId);
  }
}

function handlePracticeReady(io, socket) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.phase !== 'active') return;

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
  const userId = socket.data.user.id;
  if (!sessionId) {
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
  connectedSockets.delete(socket.id);
  removeFromQueue(socket.id);
  cleanupMentorWaiter(socket.id);
  unregisterSocket(socket.id);

  const roomId = userRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);

  // Practice is already over and both sides are writing their reviews — they do
  // not need this socket anymore. Tearing the room down quietly here is the
  // difference between a finished session and one marked abandoned, which also
  // blocks review completion and means the AI never runs on it.
  if (room?.phase === 'done') {
    deleteRoom(roomId);
    return;
  }

  const partnerSocketId = getPartnerSocketId(roomId, socket.id);
  if (partnerSocketId) io.to(partnerSocketId).emit('partner_disconnected');

  deleteRoom(roomId);

  if (room?.sessionId) {
    await markSessionAbandoned(room.sessionId);
  }
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

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id} (${socket.data.user.id})`);
    connectedSockets.add(socket.id);

    // The handshake already told us who this is, so realtime notifications are
    // wired up immediately. The old 'identify' event let a client name itself
    // and is gone — it was enough to subscribe to anyone else's notifications.
    registerUserSocket(socket.data.user.id, socket.id);

    socket.on('find_match', (data) => {
      handleFindMatch(io, socket, data).catch((err) => {
        console.error('find_match failed:', err.message);
        socket.emit('match_error', { error: 'Khong the tim doi tac luc nay' });
      });
    });
    socket.on('cancel_find_match', () => handleCancelFindMatch(socket));
    socket.on('signal', (data) => handleSignal(io, socket, data));
    socket.on('device_ready', () => handleDeviceReady(io, socket));
    socket.on('device_failed', () => handleDeviceFailed(io, socket));
    socket.on('peer_connected', () => {
      handlePeerConnected(io, socket).catch((err) => {
        console.error('peer_connected failed:', err.message);
      });
    });
    socket.on('practice_complete', () => handlePracticeComplete(socket));
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
