import { useEffect, useCallback } from 'react';
import { socket } from '../services/socket';
import { useSession } from '../context/SessionContext';

export function useSocket() {
  const { state, dispatch } = useSession();

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
    });

    socket.on('waiting', () => {
      dispatch({ type: 'SET_PHASE', payload: 'searching' });
    });

    socket.on('matched', (data) => {
      console.log('[Socket] Matched:', data);
      dispatch({ type: 'SET_MATCHED', payload: data });
      dispatch({ type: 'SET_PHASE', payload: 'matched' });
    });

    socket.on('match_error', ({ error }) => {
      dispatch({ type: 'SET_ERROR', payload: { type: 'match_error', message: error } });
      dispatch({ type: 'SET_PHASE', payload: 'lobby' });
    });

    socket.on('session_start', ({ timestamp }) => {
      console.log('[Socket] Session start:', timestamp);
      dispatch({ type: 'SET_PHASE', payload: 'in_session' });
    });

    socket.on('partner_disconnected', () => {
      dispatch({ type: 'SET_ERROR', payload: { type: 'partner_disconnected', message: 'Đối tác đã ngắt kết nối' } });
      dispatch({ type: 'SET_PHASE', payload: 'error' });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('waiting');
      socket.off('matched');
      socket.off('match_error');
      socket.off('session_start');
      socket.off('partner_disconnected');
      socket.disconnect();
    };
  }, [dispatch]);

  const findMatch = useCallback((displayName, band) => {
    dispatch({ type: 'SET_USER', payload: { displayName, band } });
    socket.emit('find_match', { displayName, band });
  }, [dispatch]);

  const cancelMatch = useCallback(() => {
    socket.emit('cancel_find_match');
    dispatch({ type: 'SET_PHASE', payload: 'lobby' });
  }, [dispatch]);

  const sendSignal = useCallback((type, payload) => {
    socket.emit('signal', { type, payload });
  }, []);

  const notifyPeerConnected = useCallback(() => {
    socket.emit('peer_connected');
  }, []);

  // Forward signal events to WebRTC
  const onSignal = useCallback((handler) => {
    socket.on('signal', handler);
    return () => socket.off('signal', handler);
  }, []);

  return { findMatch, cancelMatch, sendSignal, notifyPeerConnected, onSignal };
}
