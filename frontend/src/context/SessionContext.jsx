import { createContext, useContext, useReducer, useRef } from 'react';

const SessionContext = createContext(null);

const initialState = {
  // Phase
  phase: 'lobby', // lobby | searching | matched | device_check | in_session | review | waiting_review | ai_processing | results

  // User info
  userId: null,
  displayName: null,
  band: null,
  role: null,        // 'A' | 'B'
  sessionMode: 'peer',
  myUserRole: 'student',
  isInitiator: false,

  // Partner info
  partnerId: null,
  partnerName: null,
  partnerBand: null,
  partnerUserRole: 'student',

  // Session info
  sessionId: null,
  roomId: null,
  sessionData: null, // full session detail from GET /api/sessions/:id
  turns: [],
  sessionStartServerTimestamp: null,
  sessionStartLocalTime: null,
  practiceReady: false,
  partnerPracticeReady: false,
  practiceStarted: false,
  practiceStartServerTimestamp: null,
  practiceStartLocalTime: null,

  // Current turn
  currentTurnIndex: 0,

  // Chế độ ghép cặp. Mặc định là tự chọn: vào hàng chờ nhưng máy không tự ghép,
  // người dùng tự xem danh sách và mời.
  matchAutoMatch: false,
  // Danh sách người đang chờ, do server dựng (10 chỗ, trộn band).
  partnerList: [],
  // Lời mời đang nhận và đang gửi. Mỗi lúc chỉ có tối đa một lời mời gửi ra.
  incomingInvites: [],
  outgoingInvite: null,
  inviteError: null,

  // Camera đang tắt hay không, của mình và của đối tác. Phải nằm ở state chứ không
  // phải trong `refs`: các khung video cần vẽ lại lớp phủ khi giá trị này đổi.
  // Trạng thái của đối tác biết được qua tín hiệu `camera_state` họ gửi sang.
  cameraOff: false,
  partnerCameraOff: false,

  // True while the partner's socket is gone but their room is still being held
  // open for them. Not an error: the media link is peer-to-peer and usually
  // survives the blip, so the UI says "reconnecting" rather than ending anything.
  partnerReconnecting: false,

  // Error
  error: null,       // { type, message }

  // Audio blobs
  localAudioByTurnId: {},  // { [turnId]: Blob }
  remoteAudioByTurnId: {}, // { [turnId]: Blob }

  // Peer notes
  peerNotes: [],     // notes the current user marked while listening

  // Results
  results: null,

  // Upload statuses
  uploadStatus: {},  // { [turnId]: 'pending' | 'uploading' | 'done' | 'error' }
};

function sessionReducer(state, action) {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    case 'SET_USER':
      return { ...state, ...action.payload };

    case 'SET_MATCHED':
      return {
        ...state,
        phase: 'matched',
        error: null,
        userId: action.payload.userId,
        partnerId: action.payload.partnerId,
        partnerName: action.payload.partnerName,
        role: action.payload.role,
        sessionMode: action.payload.sessionMode || 'peer',
        myUserRole: action.payload.myUserRole || 'student',
        isInitiator: action.payload.isInitiator,
        sessionId: action.payload.sessionId,
        roomId: action.payload.roomId,
        partnerUserRole: action.payload.partnerUserRole || 'student',
        sessionData: null,
        turns: [],
        sessionStartServerTimestamp: null,
        sessionStartLocalTime: null,
        practiceReady: false,
        partnerPracticeReady: false,
        practiceStarted: false,
        practiceStartServerTimestamp: null,
        practiceStartLocalTime: null,
        currentTurnIndex: 0,
        // Ghép cặp mới thì trạng thái camera của phiên trước không còn đúng: người
        // mới chưa gửi `camera_state` nào, mà lớp phủ cũ vẫn còn thì họ trông như
        // đang tắt camera trong khi thực ra hình đang phát bình thường.
        cameraOff: false,
        partnerCameraOff: false,
        localAudioByTurnId: {},
        remoteAudioByTurnId: {},
        peerNotes: [],
        results: null,
        uploadStatus: {},
      };

    case 'SET_SESSION_DATA':
      return {
        ...state,
        sessionData: action.payload,
        turns: action.payload.turns || [],
      };

    case 'SET_SESSION_START':
      return {
        ...state,
        phase: 'in_session',
        sessionStartServerTimestamp: action.payload.timestamp,
        sessionStartLocalTime: action.payload.localTime,
      };

    case 'SET_PRACTICE_READY_STATE':
      return {
        ...state,
        practiceReady: action.payload.myReady,
        partnerPracticeReady: action.payload.partnerReady,
      };

    case 'SET_PRACTICE_START':
      return {
        ...state,
        practiceStarted: true,
        practiceStartServerTimestamp: action.payload.timestamp,
        practiceStartLocalTime: action.payload.localTime,
      };

    case 'SET_CURRENT_TURN':
      return { ...state, currentTurnIndex: action.payload };

    case 'SET_MATCH_MODE':
      return { ...state, matchAutoMatch: action.payload };

    case 'SET_PARTNER_LIST':
      return { ...state, partnerList: action.payload };

    case 'ADD_INCOMING_INVITE':
      return {
        ...state,
        incomingInvites: [
          ...state.incomingInvites.filter((invite) => invite.inviteId !== action.payload.inviteId),
          action.payload,
        ],
      };

    case 'REMOVE_INVITE':
      return {
        ...state,
        incomingInvites: state.incomingInvites.filter((invite) => invite.inviteId !== action.payload),
        outgoingInvite:
          state.outgoingInvite?.inviteId === action.payload ? null : state.outgoingInvite,
      };

    case 'SET_OUTGOING_INVITE':
      return { ...state, outgoingInvite: action.payload, inviteError: null };

    case 'SET_INVITE_ERROR':
      return { ...state, inviteError: action.payload };

    // Rời hàng chờ thì mọi thứ thuộc về hàng chờ phải biến mất cùng, nếu không
    // lần tìm sau sẽ mở ra với danh sách và lời mời cũ đã chết.
    case 'CLEAR_MATCHMAKING':
      return {
        ...state,
        partnerList: [],
        incomingInvites: [],
        outgoingInvite: null,
        inviteError: null,
      };

    case 'SET_CAMERA_OFF':
      return { ...state, cameraOff: action.payload };

    case 'SET_PARTNER_CAMERA_OFF':
      return { ...state, partnerCameraOff: action.payload };

    case 'SET_PARTNER_RECONNECTING':
      return { ...state, partnerReconnecting: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'SAVE_LOCAL_AUDIO':
      return {
        ...state,
        localAudioByTurnId: {
          ...state.localAudioByTurnId,
          [action.payload.turnId]: action.payload.blob,
        },
      };

    case 'SAVE_REMOTE_AUDIO':
      return {
        ...state,
        remoteAudioByTurnId: {
          ...state.remoteAudioByTurnId,
          [action.payload.turnId]: action.payload.blob,
        },
      };

    case 'ADD_PEER_NOTE':
      return {
        ...state,
        peerNotes: [...state.peerNotes, action.payload],
      };

    case 'UPDATE_PEER_NOTE':
      return {
        ...state,
        peerNotes: state.peerNotes.map((note) =>
          note.clientNoteId === action.payload.clientNoteId
            ? { ...note, ...action.payload }
            : note
        ),
      };

    case 'SET_UPLOAD_STATUS':
      return {
        ...state,
        uploadStatus: {
          ...state.uploadStatus,
          [action.payload.turnId]: action.payload.status,
        },
      };

    case 'SET_RESULTS':
      return { ...state, results: action.payload, phase: 'results' };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

export function SessionProvider({ children }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);

  // A session no longer defines who you are: matchmaking reuses the signed-in
  // account instead of minting a user per match, so there is nothing to persist
  // back here. AuthContext is the single source of identity.

  // Refs for WebRTC and MediaRecorder (not part of render state)
  const refs = useRef({
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    localRecorder: null,
    remoteRecorder: null,
    localChunks: [],
    remoteChunks: [],
    iceServers: null,
    pendingIceCandidates: [],
  });

  return (
    <SessionContext.Provider value={{ state, dispatch, refs }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
