import { randomUUID } from 'crypto';
import {
  createMatchedSession,
  getMentorRoomParticipants,
  markSessionAbandoned,
  markSessionActive,
  SESSION_FOCUSES,
} from '../models/sessionModel.js';
import { setIo, registerUserSocket, unregisterSocket } from './notifier.js';
import { authenticateSocket } from './auth.js';
import { parseBand as parseBandInput } from '../utils/band.js';

const MAX_BAND_DIFFERENCE = 1.0;
const MAX_DISPLAY_NAME_LENGTH = 100;
const READY_WAIT_TIMEOUT_MS = 60000;
// How long a room is held open for someone whose socket dropped. The media link
// is peer-to-peer and does not run through this server, so a brief network blip
// leaves the two browsers still talking to each other — tearing the room down on
// the first lost heartbeat destroys a call that was working fine.
const RECONNECT_GRACE_MS = 15000;

// Overridable so tests can watch the timeout expire without waiting fifteen
// real seconds for it.
function getReconnectGraceMs() {
  const raw = Number(process.env.SOCKET_RECONNECT_GRACE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : RECONNECT_GRACE_MS;
}
const CONNECT_WAIT_TIMEOUT_MS = 45000;

// Danh sách người để tự chọn. Cố ý TRỘN band thay vì lấy 10 người gần nhất: mục
// đích của việc cho chọn tay là trả lại quyền phán xét cho con người, mà người
// band 5.0 hoàn toàn có thể cố ý muốn luyện với band 7.0 để nghe người giỏi hơn
// nói. Máy không biết ý định đó nên không được tự lọc mất.
const PARTNER_LIST_SIZE = 10;
const PARTNER_LIST_SAME = 4;
const PARTNER_LIST_HIGHER = 3;
const PARTNER_LIST_LOWER = 3;
// Dưới mức này coi như cùng trình độ.
const SAME_BAND_THRESHOLD = 0.5;

const INVITE_TIMEOUT_MS = 30000;

function getInviteTimeoutMs() {
  const raw = Number(process.env.SOCKET_INVITE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : INVITE_TIMEOUT_MS;
}
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
// userId -> roomId, for people whose socket dropped and whose room is being held
// open for them. Keyed by user rather than socket because the whole point is
// that they come back on a new socket id.
const awayRoomByUser = new Map();
// inviteId -> { id, from, to, timer }. `from`/`to` giữ nguyên bản ghi hàng đợi,
// nên đọc được cả socketId lẫn userId mà không phải tra ngược.
const invitations = new Map();
// "userIdA|userIdB" (đã sắp xếp) của những cặp đã từ chối nhau. Giữ để một người
// bị từ chối không mời lại ngay lập tức — không có nó thì tính năng mời thành
// công cụ quấy rầy. Xoá khi một trong hai rời hàng đợi.
const declinedPairs = new Set();
// sessionId -> { A: userInfo|null, B: userInfo|null } for REST-started mentor
// sessions where both parties join the realtime room explicitly.
const mentorRoomWaiters = new Map();

function pairKey(userIdA, userIdB) {
  return [userIdA, userIdB].sort().join('|');
}

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

// Dùng chung bộ kiểm với hồ sơ người dùng, nhưng ở đây band sai thì coi như chưa
// khai chứ không ném lỗi: một payload rác không được làm rơi kết nối của người
// đang chờ ghép cặp.
function parseBand(band) {
  return parseBandInput(band).band ?? null;
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

// Phần IELTS muốn luyện. Không gửi thì mặc định buổi đầy đủ, giữ nguyên hành vi
// của những client cũ chưa biết tới tính năng này.
function parseFocus(focus) {
  if (focus === null || focus === undefined || focus === '') {
    return 'full';
  }

  if (typeof focus !== 'string' || !SESSION_FOCUSES.includes(focus)) {
    return null;
  }

  return focus;
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

  const focus = parseFocus(data.focus);
  if (!focus) {
    return { error: 'Phan luyen tap khong hop le' };
  }

  // Mặc định là "Lựa chọn ghép cặp": vào hàng đợi nhưng máy không tự ghép. Chỉ
  // khi client nói rõ autoMatch === true thì mới được ghép tự động.
  const autoMatch = data.autoMatch === true;

  return { displayName, band, sessionMode, userRole, autoMatch, focus };
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

// Chỉ ghép người đang ở chế độ "Ghép ngẫu nhiên" với nhau. Người đang tự chọn
// mà bị máy bốc mất giữa lúc đọc danh sách thì tính năng chọn thành vô nghĩa —
// chưa kịp mời ai đã vào phiên rồi.
function findBestBandMatch(user) {
  if (!user.autoMatch) return null;

  let bestMatch = null;

  for (const candidate of waitingQueue) {
    if (!candidate.autoMatch) continue;
    // Cả hai người trả lời chung một bộ câu hỏi, nên phần luyện phải trùng nhau
    // — không có cách nào cho một người luyện Part 1 còn người kia Part 3.
    if (candidate.focus !== user.focus) continue;

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

// Danh sách người để chọn, cho MỘT người xem. Chia ba nhóm rồi lấy người gần
// band nhất trong từng nhóm, thay vì xếp phẳng theo độ gần — xếp phẳng thì với
// một hàng đợi đông, cả 10 chỗ sẽ toàn người cùng trình độ và người dùng không
// bao giờ nhìn thấy ai khác mình.
function buildPartnerList(viewer) {
  // Chỉ hiện người chọn cùng phần luyện. Hiện cả người khác phần rồi chặn lúc
  // mời thì tệ hơn: người dùng bấm mời và nhận về một lời từ chối của hệ thống
  // mà không hiểu tại sao.
  const others = waitingQueue.filter(
    (candidate) =>
      candidate.socketId !== viewer.socketId &&
      candidate.userId !== viewer.userId &&
      candidate.focus === viewer.focus &&
      isSocketAlive(candidate.socketId)
  );

  const byCloseness = (a, b) =>
    Math.abs((a.band ?? 0) - (viewer.band ?? 0)) - Math.abs((b.band ?? 0) - (viewer.band ?? 0));

  const gapOf = (candidate) => (candidate.band ?? 0) - (viewer.band ?? 0);

  const same = others.filter((c) => Math.abs(gapOf(c)) < SAME_BAND_THRESHOLD).sort(byCloseness);
  const higher = others.filter((c) => gapOf(c) >= SAME_BAND_THRESHOLD).sort(byCloseness);
  const lower = others.filter((c) => gapOf(c) <= -SAME_BAND_THRESHOLD).sort(byCloseness);

  const picked = [
    ...same.slice(0, PARTNER_LIST_SAME),
    ...higher.slice(0, PARTNER_LIST_HIGHER),
    ...lower.slice(0, PARTNER_LIST_LOWER),
  ];

  // Nhóm nào thiếu thì bù từ những người còn lại, để danh sách luôn đủ 10 chỗ
  // khi có đủ người. Thiếu chỗ mà vẫn còn người là lãng phí một cơ hội ghép.
  if (picked.length < PARTNER_LIST_SIZE) {
    const chosen = new Set(picked.map((c) => c.socketId));
    for (const candidate of others.sort(byCloseness)) {
      if (picked.length >= PARTNER_LIST_SIZE) break;
      if (!chosen.has(candidate.socketId)) {
        picked.push(candidate);
        chosen.add(candidate.socketId);
      }
    }
  }

  const declined = new Set();
  for (const candidate of picked) {
    if (declinedPairs.has(pairKey(viewer.userId, candidate.userId))) {
      declined.add(candidate.userId);
    }
  }

  return picked.slice(0, PARTNER_LIST_SIZE).map((candidate) => ({
    userId: candidate.userId,
    displayName: candidate.displayName,
    band: candidate.band,
    // Cho người xem biết người này có thể biến mất bất cứ lúc nào vì đang được
    // máy ghép hộ, thay vì để họ mời rồi ngơ ngác khi lời mời hỏng.
    autoMatch: candidate.autoMatch === true,
    focus: candidate.focus || 'full',
    waitingSeconds: Math.round((Date.now() - candidate.joinedAt) / 1000),
    // Đã từ chối nhau thì hiện nhưng không mời lại được.
    declined: declined.has(candidate.userId),
  }));
}

function sendPartnerList(io, entry) {
  io.to(entry.socketId).emit('partner_list', { partners: buildPartnerList(entry) });
}

// Hàng đợi đổi thì mọi người đang chờ đều phải thấy danh sách mới. Với quy mô
// vài chục người thì gửi lại toàn bộ là đủ rẻ và không có trạng thái nào để lệch.
function broadcastPartnerLists(io) {
  for (const entry of waitingQueue) {
    sendPartnerList(io, entry);
  }
}

function findQueueEntryBySocket(socketId) {
  return waitingQueue.find((entry) => entry.socketId === socketId) || null;
}

function findQueueEntryByUser(userId) {
  return waitingQueue.find((entry) => entry.userId === userId) || null;
}

function clearInvite(inviteId) {
  const invite = invitations.get(inviteId);
  if (!invite) return null;

  clearTimeout(invite.timer);
  invitations.delete(inviteId);
  return invite;
}

// Huỷ mọi lời mời mà người này dính vào, ở cả hai vai. Gọi khi họ rời hàng đợi,
// được ghép, hoặc mất kết nối — nếu không, người còn lại ngồi chờ một lời mời
// không bao giờ được trả lời.
function cancelInvitesInvolving(io, userId, reason) {
  for (const invite of [...invitations.values()]) {
    if (invite.from.userId !== userId && invite.to.userId !== userId) continue;

    clearInvite(invite.id);
    const otherSocketId =
      invite.from.userId === userId ? invite.to.socketId : invite.from.socketId;
    io.to(otherSocketId).emit('invite_cancelled', { inviteId: invite.id, reason });
  }
}

function forgetDeclinesFor(userId) {
  for (const key of [...declinedPairs]) {
    if (key.split('|').includes(userId)) {
      declinedPairs.delete(key);
    }
  }
}

// Rời hàng đợi là một việc, và mọi đường ra đều phải đi qua đây: bỏ khỏi hàng
// đợi, huỷ lời mời, quên các lần từ chối. Bỏ sót bước nào cũng để lại rác trỏ
// tới một người không còn ở đó.
function leaveQueue(io, socketId, userId, reason) {
  removeFromQueue(socketId);
  if (userId) {
    cancelInvitesInvolving(io, userId, reason);
    forgetDeclinesFor(userId);
  }
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
    // userId -> grace timer, for participants who are currently away.
    awayUsers: new Map(),
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

  // Anyone still being waited for stops being waited for. Leaving a grace timer
  // running would fire against a room that no longer exists, and leaving the
  // lookup entry behind would send their next connection into a dead room.
  for (const [userId, timer] of room.awayUsers) {
    clearTimeout(timer);
    awayRoomByUser.delete(userId);
  }
  room.awayUsers.clear();

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
    autoMatch: matchRequest.autoMatch === true,
    focus: matchRequest.focus || 'full',
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
  // Chốt cuối. Cả hai đường tới đây (ghép ngẫu nhiên và đồng ý lời mời) đều đã
  // kiểm phần luyện, nên lệch ở đây là một lỗi lập trình — thà không tạo phiên
  // còn hơn ghi vào cơ sở dữ liệu một phiên mà một người luyện sai phần.
  if (user.focus !== matchedUser.focus) {
    console.error(`[Match] Từ chối ghép: phần luyện lệch (${user.focus} vs ${matchedUser.focus})`);
    for (const person of [matchedUser, user]) {
      // Đường ghép ngẫu nhiên chưa lấy ai ra khỏi hàng đợi, đường lời mời thì đã
      // lấy cả hai. Ai còn đang chờ thì để yên, đừng báo lỗi cho người không hỏi gì.
      if (isSocketQueued(person.socketId)) continue;
      if (!requeueUser(io, person)) {
        io.to(person.socketId).emit('match_error', { error: 'Hai người đang luyện hai phần khác nhau' });
      }
    }
    return false;
  }

  removeFromQueue(matchedUser.socketId);

  const roomId = randomUUID();
  let session = null;

  try {
    session = await createMatchedSession(roomId, matchedUser, user, 'peer', user.focus);
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
  // Đã vào phiên thì mọi lời mời còn treo của cả hai đều vô nghĩa.
  cancelInvitesInvolving(io, matchedUser.userId, 'partner_matched');
  cancelInvitesInvolving(io, user.userId, 'partner_matched');
  forgetDeclinesFor(matchedUser.userId);
  forgetDeclinesFor(user.userId);
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
  console.log(
    `[Queue] +${user.displayName} (${user.band}) ${user.autoMatch ? 'ngau nhien' : 'tu chon'} | size: ${waitingQueue.length}`
  );
  socket.emit('waiting', { autoMatch: user.autoMatch });
  // Người mới vào làm danh sách của mọi người khác đổi, nên phát lại cho tất cả
  // chứ không riêng người này.
  broadcastPartnerLists(io);
}

function handleCancelFindMatch(io, socket) {
  leaveQueue(io, socket.id, socket.data.user?.id, 'partner_left');
  console.log(`[Queue] -${socket.id} cancelled`);
  broadcastPartnerLists(io);
}

// Đổi giữa "Lựa chọn ghép cặp" và "Ghép ngẫu nhiên" khi đang chờ. Chuyển sang
// ngẫu nhiên là thử ghép ngay, vì đó chính là điều người dùng vừa yêu cầu.
async function handleSetMatchMode(io, socket, data) {
  const entry = findQueueEntryBySocket(socket.id);
  if (!entry) return;

  const autoMatch = data?.autoMatch === true;
  if (entry.autoMatch === autoMatch) return;

  entry.autoMatch = autoMatch;
  socket.emit('match_mode', { autoMatch });

  if (autoMatch) {
    // Chuyển sang ngẫu nhiên thì mọi lời mời đang treo của họ mất ý nghĩa.
    cancelInvitesInvolving(io, entry.userId, 'partner_left');

    removeFromQueue(entry.socketId);
    const matchedUser = findBestBandMatch(entry);
    if (matchedUser) {
      await createPeerMatch(io, entry, matchedUser);
      broadcastPartnerLists(io);
      return;
    }
    waitingQueue.push(entry);
  }

  broadcastPartnerLists(io);
}

function handleRequestPartnerList(io, socket) {
  const entry = findQueueEntryBySocket(socket.id);
  if (!entry) return;

  sendPartnerList(io, entry);
}

function handleInvitePartner(io, socket, data) {
  const from = findQueueEntryBySocket(socket.id);
  if (!from) return;

  const targetUserId = typeof data?.toUserId === 'string' ? data.toUserId : null;
  if (!targetUserId || targetUserId === from.userId) {
    socket.emit('invite_error', { error: 'Không mời được người này' });
    return;
  }

  // Một lời mời gửi ra tại một thời điểm. Không có chốt này thì một người rải
  // lời mời cho cả 10 người rồi ba người cùng đồng ý.
  const existing = [...invitations.values()].find((invite) => invite.from.userId === from.userId);
  if (existing) {
    socket.emit('invite_error', { error: 'Bạn đang có một lời mời chờ trả lời' });
    return;
  }

  const to = findQueueEntryByUser(targetUserId);
  if (!to || !isSocketAlive(to.socketId)) {
    socket.emit('invite_error', { error: 'Người này không còn trong hàng chờ' });
    broadcastPartnerLists(io);
    return;
  }

  if (declinedPairs.has(pairKey(from.userId, to.userId))) {
    socket.emit('invite_error', { error: 'Người này đã từ chối lời mời trước đó' });
    return;
  }

  // Danh sách đã lọc theo phần luyện, nên tới được đây là client đang giữ một
  // danh sách cũ — người kia vừa đổi phần. Chặn ở đây vì phiên chỉ có một bộ
  // câu hỏi cho cả hai.
  if (from.focus !== to.focus) {
    socket.emit('invite_error', { error: 'Người này đang luyện phần khác với bạn' });
    broadcastPartnerLists(io);
    return;
  }

  const inviteId = randomUUID();
  const timer = setTimeout(() => {
    clearInvite(inviteId);
    io.to(from.socketId).emit('invite_expired', { inviteId });
    io.to(to.socketId).emit('invite_cancelled', { inviteId, reason: 'expired' });
  }, getInviteTimeoutMs());
  timer.unref?.();

  invitations.set(inviteId, { id: inviteId, from, to, timer });

  io.to(to.socketId).emit('invite_received', {
    inviteId,
    fromUserId: from.userId,
    displayName: from.displayName,
    band: from.band,
    expiresInMs: getInviteTimeoutMs(),
  });
  io.to(from.socketId).emit('invite_sent', {
    inviteId,
    toUserId: to.userId,
    displayName: to.displayName,
    expiresInMs: getInviteTimeoutMs(),
  });
}

function handleCancelInvite(io, socket) {
  const invite = [...invitations.values()].find(
    (item) => item.from.socketId === socket.id
  );
  if (!invite) return;

  clearInvite(invite.id);
  io.to(invite.to.socketId).emit('invite_cancelled', { inviteId: invite.id, reason: 'cancelled' });
  socket.emit('invite_cancelled', { inviteId: invite.id, reason: 'cancelled' });
}

async function handleRespondInvite(io, socket, data) {
  const inviteId = typeof data?.inviteId === 'string' ? data.inviteId : null;
  if (!inviteId) return;

  const invite = invitations.get(inviteId);
  if (!invite || invite.to.socketId !== socket.id) {
    socket.emit('invite_error', { error: 'Lời mời không còn hiệu lực' });
    return;
  }

  clearInvite(inviteId);

  if (data.accept !== true) {
    // Nhớ lại việc từ chối để không bị mời lại ngay. Người gửi chỉ nhận một câu
    // trung lập — không ai cần biết mình bị chê.
    declinedPairs.add(pairKey(invite.from.userId, invite.to.userId));
    io.to(invite.from.socketId).emit('invite_declined', { inviteId });
    // Người từ chối cũng phải được xác nhận. `clearInvite` ở trên đã tắt luôn đồng
    // hồ 30 giây, nên nếu không gửi gì thì không còn sự kiện nào tới sau và thẻ lời
    // mời nằm lại trên màn hình họ mãi mãi — bấm "Đồng ý" lúc đó chỉ nhận về lỗi.
    socket.emit('invite_cancelled', { inviteId, reason: 'declined' });
    broadcastPartnerLists(io);
    return;
  }

  // Từ đây tới createPeerMatch không được có await nào: lấy hai người ra khỏi
  // hàng đợi CHÍNH LÀ hành động chiếm chỗ. Node chạy một luồng nên kiểm tra
  // đồng bộ là an toàn tuyệt đối, và nó xử lý cả ba tình huống rối: hai người
  // cùng mời một người, mời chéo nhau, và máy ghép ngẫu nhiên giành mất người
  // đang cân nhắc.
  const fromStillQueued = findQueueEntryByUser(invite.from.userId);
  const toStillQueued = findQueueEntryByUser(invite.to.userId);

  if (!fromStillQueued || !toStillQueued || !isSocketAlive(invite.from.socketId)) {
    socket.emit('invite_error', { error: 'Người mời không còn trong hàng chờ' });
    broadcastPartnerLists(io);
    return;
  }

  removeFromQueue(invite.from.socketId);
  removeFromQueue(invite.to.socketId);
  cancelInvitesInvolving(io, invite.from.userId, 'partner_matched');
  cancelInvitesInvolving(io, invite.to.userId, 'partner_matched');
  forgetDeclinesFor(invite.from.userId);
  forgetDeclinesFor(invite.to.userId);

  // Hội tụ về đúng đường ghép cũ, nên DeviceCheck, WebRTC, review, AI và kết quả
  // không phải sửa một dòng nào.
  await createPeerMatch(io, invite.to, invite.from);
  broadcastPartnerLists(io);
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
    // Carried so a room built from this waiter can recognise the person behind
    // it when they come back on a different socket.
    userId,
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

function getRoomSide(room, userId) {
  if (room.userA.userId === userId) return 'userA';
  if (room.userB.userId === userId) return 'userB';
  return null;
}

// Hold the room open instead of tearing it down. The partner is told someone is
// reconnecting rather than that they left, and the session row is left alone —
// marking it abandoned here is what used to make a three-second network blip
// unrecoverable even though the two browsers were still connected to each other.
function beginReconnectGrace(io, roomId, room, socket) {
  const userId = socket.data.user.id;
  const partnerSocketId = getPartnerSocketId(roomId, socket.id);

  // The dead socket must stop resolving to this room, or a stale event on it
  // would still be treated as coming from a participant.
  userRoom.delete(socket.id);

  const timer = setTimeout(() => {
    room.awayUsers.delete(userId);
    awayRoomByUser.delete(userId);

    // The practice can finish while this timer is still running: they drop mid
    // practice, the partner plays out the rest and presses complete. Abandoning
    // the session then would destroy a finished recording and block the AI from
    // ever running on it — the exact failure the room phases were added to stop.
    if (room.phase === 'done') {
      deleteRoom(roomId);
      return;
    }

    closeRoom(io, roomId, 'partner_disconnected', { skipSocketId: socket.id }).catch((err) => {
      console.error('reconnect grace expiry failed:', err.message);
    });
  }, getReconnectGraceMs());
  timer.unref?.();

  room.awayUsers.set(userId, timer);
  awayRoomByUser.set(userId, roomId);

  if (partnerSocketId) io.to(partnerSocketId).emit('partner_reconnecting');
  console.log(`[Room] ${roomId}: chờ ${userId} kết nối lại`);
}

// Someone came back within the grace period. Everything about a room is keyed by
// socket id, and they have a new one, so the old id has to be swapped out
// everywhere at once — including the ready/connected sets, or the room forgets
// they had already pressed ready and waits for a second press that never comes.
function resumeRoomIfAway(io, socket) {
  const userId = socket.data.user.id;
  const roomId = awayRoomByUser.get(userId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  const side = room && getRoomSide(room, userId);
  if (!room || !side) {
    awayRoomByUser.delete(userId);
    return;
  }

  clearTimeout(room.awayUsers.get(userId));
  room.awayUsers.delete(userId);
  awayRoomByUser.delete(userId);

  const oldSocketId = room[side].socketId;
  room[side].socketId = socket.id;
  userRoom.delete(oldSocketId);
  userRoom.set(socket.id, roomId);

  for (const set of [
    room.deviceReadyUsers,
    room.connectedUsers,
    room.practiceCompleteUsers,
    room.practiceReadyUsers,
  ]) {
    if (set.delete(oldSocketId)) set.add(socket.id);
  }

  const partnerSocketId = getPartnerSocketId(roomId, socket.id);
  if (partnerSocketId) io.to(partnerSocketId).emit('partner_reconnected');

  // The client has to be told where things stand: it has a fresh socket and no
  // idea which phase the room reached while it was away.
  socket.emit('session_resumed', {
    roomId,
    sessionId: room.sessionId,
    phase: room.phase,
    sessionMode: room.sessionMode,
  });
  console.log(`[Room] ${roomId}: ${userId} đã kết nối lại`);
}

async function handleDisconnect(io, socket) {
  console.log(`[Socket] Disconnected: ${socket.id}`);
  connectedSockets.delete(socket.id);
  // Rời hàng đợi phải kéo theo việc huỷ lời mời, nếu không người còn lại ngồi
  // chờ một lời mời không bao giờ được trả lời.
  leaveQueue(io, socket.id, socket.data.user?.id, 'partner_left');
  broadcastPartnerLists(io);
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

  // Not gone, just unreachable for the moment — give them 15 seconds to come
  // back before treating this as someone leaving.
  if (room && getRoomSide(room, socket.data.user.id)) {
    beginReconnectGrace(io, roomId, room, socket);
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

    // Before anything else: if this person's room is being held open for them,
    // put them back in it rather than letting them start a fresh search.
    resumeRoomIfAway(io, socket);

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
    socket.on('cancel_find_match', () => handleCancelFindMatch(io, socket));
    socket.on('request_partner_list', () => handleRequestPartnerList(io, socket));
    socket.on('set_match_mode', (data) => {
      handleSetMatchMode(io, socket, data).catch((err) => {
        console.error('set_match_mode failed:', err.message);
      });
    });
    socket.on('invite_partner', (data) => handleInvitePartner(io, socket, data));
    socket.on('cancel_invite', () => handleCancelInvite(io, socket));
    socket.on('respond_invite', (data) => {
      handleRespondInvite(io, socket, data).catch((err) => {
        console.error('respond_invite failed:', err.message);
        socket.emit('invite_error', { error: 'Không xử lý được lời mời' });
      });
    });
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
