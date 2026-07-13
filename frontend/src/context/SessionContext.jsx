import { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { getIdentity, saveIdentity } from '../utils/identity';

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

  // Keep the persisted identity (userId + role + name + band) consistent with
  // the active session's user. Merge so we never clobber known values with
  // nulls — a peer match fully switches identity to the fresh peer user, while
  // a mentor session keeps the mentor's signed-in name/band.
  useEffect(() => {
    if (!state.userId) {
      return;
    }

    const existing = getIdentity() || {};
    const sameUser = existing.userId === state.userId;

    saveIdentity({
      userId: state.userId,
      userRole: state.myUserRole || (sameUser ? existing.userRole : 'student'),
      displayName: state.displayName || (sameUser ? existing.displayName : ''),
      band: state.band != null ? state.band : (sameUser ? existing.band : null),
    });
  }, [state.userId, state.myUserRole, state.displayName, state.band]);

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
