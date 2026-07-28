import { useCallback, useEffect } from 'react';
import { socket } from '../services/socket';
import { useSession } from '../context/SessionContext';
import { cleanupMediaSession } from '../utils/mediaCleanup';

function getSessionStartLocalTime(serverTimestamp) {
  if (!Number.isFinite(serverTimestamp)) {
    return performance.now();
  }

  const elapsedSinceServerStart = Date.now() - serverTimestamp;

  if (elapsedSinceServerStart < 0 || elapsedSinceServerStart > 5 * 60 * 1000) {
    return performance.now();
  }

  return performance.now() - elapsedSinceServerStart;
}

export function useSocket() {
  const { dispatch, refs } = useSession();

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    function handleConnect() {
      console.log('[Socket] Connected:', socket.id);
    }

    function handleDisconnect() {
      console.log('[Socket] Disconnected');
    }

    function handleWaiting() {
      dispatch({ type: 'SET_PHASE', payload: 'searching' });
    }

    function handleMatched(data) {
      console.log('[Socket] Matched:', data);
      dispatch({ type: 'SET_MATCHED', payload: data });
      dispatch({ type: 'SET_PHASE', payload: 'matched' });
    }

    function handleMatchError({ error }) {
      dispatch({ type: 'SET_ERROR', payload: { type: 'match_error', message: error } });
      dispatch({ type: 'SET_PHASE', payload: 'lobby' });
    }

    function handleSessionStart({ timestamp }) {
      console.log('[Socket] Session start:', timestamp);
      dispatch({
        type: 'SET_SESSION_START',
        payload: {
          timestamp,
          localTime: getSessionStartLocalTime(timestamp),
        },
      });
    }

    function handlePracticeReadyState(data) {
      dispatch({ type: 'SET_PRACTICE_READY_STATE', payload: data });
    }

    function handlePracticeStart({ timestamp }) {
      console.log('[Socket] Practice start:', timestamp);
      dispatch({
        type: 'SET_PRACTICE_START',
        payload: {
          timestamp,
          localTime: getSessionStartLocalTime(timestamp),
        },
      });
    }

    function handlePartnerDisconnected() {
      cleanupMediaSession(refs);
      dispatch({
        type: 'SET_ERROR',
        payload: { type: 'partner_disconnected', message: 'Đối tác đã ngắt kết nối' },
      });
      dispatch({ type: 'SET_PHASE', payload: 'error' });
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('waiting', handleWaiting);
    socket.on('matched', handleMatched);
    socket.on('match_error', handleMatchError);
    socket.on('session_start', handleSessionStart);
    socket.on('practice_ready_state', handlePracticeReadyState);
    socket.on('practice_start', handlePracticeStart);
    socket.on('partner_disconnected', handlePartnerDisconnected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('waiting', handleWaiting);
      socket.off('matched', handleMatched);
      socket.off('match_error', handleMatchError);
      socket.off('session_start', handleSessionStart);
      socket.off('practice_ready_state', handlePracticeReadyState);
      socket.off('practice_start', handlePracticeStart);
      socket.off('partner_disconnected', handlePartnerDisconnected);
    };
  }, [dispatch, refs]);

  // The server takes the name and role from the signed-in account behind the
  // handshake; band is the only thing this side still gets to choose.
  const findMatch = useCallback((displayName, band) => {
    dispatch({ type: 'SET_USER', payload: { displayName, band } });
    if (socket.connected) {
      socket.disconnect();
    }
    socket.connect();
    socket.emit('find_match', { band });
  }, [dispatch]);

  const cancelMatch = useCallback(() => {
    socket.emit('cancel_find_match');
    dispatch({ type: 'SET_PHASE', payload: 'lobby' });
  }, [dispatch]);

  // Join the realtime room for a mentor session already created via REST.
  // Both the mentor and the chosen student call this; the server pairs them.
  const joinMentorRoom = useCallback((sessionId) => {
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('join_mentor_room', { sessionId });
  }, []);

  const sendSignal = useCallback((type, payload) => {
    socket.emit('signal', { type, payload });
  }, []);

  const notifyPeerConnected = useCallback(() => {
    socket.emit('peer_connected');
  }, []);

  const notifyPracticeReady = useCallback(() => {
    socket.emit('practice_ready');
  }, []);

  const disconnectSocket = useCallback(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  }, []);

  const onSignal = useCallback((handler) => {
    socket.on('signal', handler);
    return () => socket.off('signal', handler);
  }, []);

  return {
    findMatch,
    cancelMatch,
    joinMentorRoom,
    sendSignal,
    notifyPeerConnected,
    notifyPracticeReady,
    disconnectSocket,
    onSignal,
  };
}
