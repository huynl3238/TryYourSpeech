import { useCallback, useEffect } from 'react';
import { socket } from '../services/socket';
import { useSession } from '../context/SessionContext';
import { cleanupMediaSession } from '../utils/mediaCleanup';

// The timeline is driven from performance.now(), which no clock change can move.
// The server timestamp is used only to recover the delivery delay, and that is
// where the machine's wall clock leaks in: Date.now() - serverTimestamp is the
// delay plus whatever the two clocks disagree by.
//
// The tolerance is deliberately small. It used to be five minutes, so a laptop
// running a minute behind the server started the session a minute into the
// timeline — a wrong turn, or straight into the partner's speaking slot. A
// websocket event does not take ten seconds to arrive; anything larger is a
// clock difference, and ignoring it costs only the real delivery delay.
const MAX_PLAUSIBLE_DELIVERY_DELAY_MS = 10 * 1000;

function getSessionStartLocalTime(serverTimestamp) {
  if (!Number.isFinite(serverTimestamp)) {
    return performance.now();
  }

  const elapsedSinceServerStart = Date.now() - serverTimestamp;

  if (elapsedSinceServerStart < 0 || elapsedSinceServerStart > MAX_PLAUSIBLE_DELIVERY_DELAY_MS) {
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

    // Every way a match can die before the practice starts used to arrive as
    // `partner_disconnected`, so a flat microphone, a slow permission prompt and
    // a closed tab all told the other person the same untrue thing. Each cause
    // now has its own event and its own wording.
    function failMatch(type, title, message) {
      return function handleMatchFailure() {
        cleanupMediaSession(refs);
        dispatch({ type: 'SET_ERROR', payload: { type, title, message } });
        dispatch({ type: 'SET_PHASE', payload: 'error' });
      };
    }

    const handlePartnerDisconnected = failMatch(
      'partner_disconnected',
      'Đối tác đã ngắt kết nối',
      'Đối tác đã rời khỏi phiên luyện tập. Vui lòng tìm đối tác mới.'
    );

    const handlePartnerNotReady = failMatch(
      'partner_not_ready',
      'Đối tác chưa sẵn sàng kịp',
      'Đối tác không xác nhận sẵn sàng trong 60 giây. Có thể họ đang gặp trục trặc với micro hoặc camera.'
    );

    const handlePartnerDeviceFailed = failMatch(
      'partner_device_failed',
      'Đối tác gặp sự cố thiết bị',
      'Micro hoặc camera của đối tác không hoạt động nên phiên không thể bắt đầu. Thiết bị của bạn vẫn bình thường.'
    );

    const handleWebrtcFailed = failMatch(
      'webrtc_failed',
      'Không thiết lập được kết nối',
      'Hai máy không kết nối được với nhau, thường do tường lửa hoặc mạng hạn chế. Thử lại bằng mạng khác nếu lỗi lặp lại.'
    );

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('waiting', handleWaiting);
    socket.on('matched', handleMatched);
    socket.on('match_error', handleMatchError);
    socket.on('session_start', handleSessionStart);
    socket.on('practice_ready_state', handlePracticeReadyState);
    socket.on('practice_start', handlePracticeStart);
    socket.on('partner_disconnected', handlePartnerDisconnected);
    socket.on('partner_not_ready', handlePartnerNotReady);
    socket.on('partner_device_failed', handlePartnerDeviceFailed);
    socket.on('webrtc_failed', handleWebrtcFailed);

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
      socket.off('partner_not_ready', handlePartnerNotReady);
      socket.off('partner_device_failed', handlePartnerDeviceFailed);
      socket.off('webrtc_failed', handleWebrtcFailed);
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

  // Mic and camera work and the user pressed ready. Negotiation has not started.
  const notifyDeviceReady = useCallback(() => {
    socket.emit('device_ready');
  }, []);

  // Mic or camera could not be opened, so the partner is told the real cause
  // instead of being handed a disconnect they cannot act on.
  const notifyDeviceFailed = useCallback(() => {
    socket.emit('device_failed');
  }, []);

  // WebRTC reported `connected`: the media link is real and the session clock
  // may start. Nothing before this point proves the two browsers can talk.
  const notifyPeerConnected = useCallback(() => {
    socket.emit('peer_connected');
  }, []);

  // The practice timeline ran out. This retires the room so that later leaving
  // the page during review cannot be mistaken for abandoning the session.
  const notifyPracticeComplete = useCallback(() => {
    socket.emit('practice_complete');
  }, []);

  const onBeginSignaling = useCallback((handler) => {
    socket.on('begin_signaling', handler);
    return () => socket.off('begin_signaling', handler);
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
    notifyDeviceReady,
    notifyDeviceFailed,
    notifyPeerConnected,
    notifyPracticeComplete,
    notifyPracticeReady,
    disconnectSocket,
    onSignal,
    onBeginSignaling,
  };
}
