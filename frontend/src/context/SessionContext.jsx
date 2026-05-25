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
  isInitiator: false,

  // Partner info
  partnerId: null,
  partnerName: null,
  partnerBand: null,

  // Session info
  sessionId: null,
  roomId: null,
  sessionData: null, // full session detail from GET /api/sessions/:id
  turns: [],

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
        userId: action.payload.userId,
        partnerId: action.payload.partnerId,
        partnerName: action.payload.partnerName,
        role: action.payload.role,
        isInitiator: action.payload.isInitiator,
        sessionId: action.payload.sessionId,
        roomId: action.payload.roomId,
      };

    case 'SET_SESSION_DATA':
      return {
        ...state,
        sessionData: action.payload.session,
        turns: action.payload.turns,
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
