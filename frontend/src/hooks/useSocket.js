import { useCallback, useEffect } from 'react';
import { socket } from '../services/socket';
import { useSession } from '../context/SessionContext';
import { cleanupMediaSession } from '../utils/mediaCleanup';

// Ignore implausible delivery delays caused by different client/server clocks.
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

    function handleDisconnect() {
      dispatch({ type: 'SET_PARTNER_RECONNECTING', payload: false });
    }

    function handleWaiting() {
      dispatch({ type: 'SET_PHASE', payload: 'searching' });
    }

    function handleMatched(data) {
      dispatch({ type: 'SET_MATCHED', payload: data });
      dispatch({ type: 'SET_PHASE', payload: 'matched' });
    }

    function handleMatchError({ error }) {
      dispatch({ type: 'SET_ERROR', payload: { type: 'match_error', message: error } });
      dispatch({ type: 'SET_PHASE', payload: 'lobby' });
    }

    function handleSessionStart({ timestamp }) {
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
        // Whatever the cause, nobody is coming back now.
        dispatch({ type: 'SET_PARTNER_RECONNECTING', payload: false });
        dispatch({ type: 'SET_ERROR', payload: { type, title, message } });
        dispatch({ type: 'SET_PHASE', payload: 'error' });
      };
    }

    // Only reached after the grace period has already expired on the server.
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

    const handlePartnerDeclined = failMatch(
      'partner_declined',
      'Đối tác đã huỷ phiên luyện',
      'Đối tác quyết định không tiếp tục phiên này. Thiết bị của bạn vẫn bình thường — hãy tìm một người khác.'
    );

    // Người nói đã bấm kết thúc lượt sớm. Con số này tới từ server nên hai máy
    // nhận đúng một giá trị và lịch trình phía sau vẫn khớp nhau.
    function handleTurnEndedEarly({ turnIndex, spokenMs }) {
      dispatch({
        type: 'SET_TURN_ENDED_EARLY',
        payload: { turnIndex: Number(turnIndex), spokenMs: Number(spokenMs) },
      });
    }

    // A dropped socket is not the same thing as someone leaving. The server holds
    // the room open for 15 seconds, and because WebRTC runs browser-to-browser
    // the picture and sound usually never stop — so this must not tear anything
    // down, only say what is happening.
    function handlePartnerReconnecting() {
      dispatch({ type: 'SET_PARTNER_RECONNECTING', payload: true });
    }

    function handlePartnerReconnected() {
      dispatch({ type: 'SET_PARTNER_RECONNECTING', payload: false });
    }

    // Đối tác đi hẳn, nhưng việc của mình không hỏng theo: phần nói đã xong, còn
    // lại là ghi chú và chấm điểm — làm một mình vẫn xong. Nên chỉ báo một dòng
    // rồi thôi, không dựng màn hình lỗi như `partner_disconnected`; dựng lên là
    // thổi bay phần ghi chú người dùng đang viết dở.
    function handlePartnerLeft() {
      dispatch({ type: 'SET_PARTNER_LEFT_NOTICE', payload: true });
    }

    // This client is the one that came back, and the server has just put it into
    // the room it was already in. Clearing the error matters: the socket-level
    // 'disconnect' handler may have flagged one on the way down.
    function handleSessionResumed(data) {
      dispatch({ type: 'SET_PARTNER_RECONNECTING', payload: false });
      dispatch({ type: 'CLEAR_ERROR' });

      // Bắt kịp những lượt đã kết thúc sớm trong lúc mất kết nối. Reducer chỉ
      // nhận con số nhỏ hơn nên áp lại những mốc đã biết là vô hại.
      for (const [turnIndex, spokenMs] of Object.entries(data?.earlyTurnEnds || {})) {
        dispatch({
          type: 'SET_TURN_ENDED_EARLY',
          payload: { turnIndex: Number(turnIndex), spokenMs: Number(spokenMs) },
        });
      }
    }

    function handlePartnerList({ partners }) {
      dispatch({ type: 'SET_PARTNER_LIST', payload: partners || [] });
    }

    function handleMatchMode({ autoMatch }) {
      dispatch({ type: 'SET_MATCH_MODE', payload: autoMatch === true });
    }

    function handleInviteReceived(invite) {
      dispatch({ type: 'ADD_INCOMING_INVITE', payload: invite });
    }

    function handleInviteSent(invite) {
      dispatch({ type: 'SET_OUTGOING_INVITE', payload: invite });
    }

    function handleInviteCancelled({ inviteId }) {
      dispatch({ type: 'REMOVE_INVITE', payload: inviteId });
    }

    function handleInviteDeclined({ inviteId }) {
      dispatch({ type: 'REMOVE_INVITE', payload: inviteId });
      dispatch({ type: 'SET_INVITE_ERROR', payload: 'Người này chưa nhận lời mời của bạn.' });
    }

    function handleInviteExpired({ inviteId }) {
      dispatch({ type: 'REMOVE_INVITE', payload: inviteId });
      dispatch({ type: 'SET_INVITE_ERROR', payload: 'Lời mời đã hết hạn.' });
    }

    function handleInviteError({ error }) {
      dispatch({ type: 'SET_INVITE_ERROR', payload: error });
    }

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
    socket.on('partner_declined', handlePartnerDeclined);
    socket.on('turn_ended_early', handleTurnEndedEarly);
    socket.on('partner_reconnecting', handlePartnerReconnecting);
    socket.on('partner_reconnected', handlePartnerReconnected);
    socket.on('partner_left', handlePartnerLeft);
    socket.on('session_resumed', handleSessionResumed);
    socket.on('partner_list', handlePartnerList);
    socket.on('match_mode', handleMatchMode);
    socket.on('invite_received', handleInviteReceived);
    socket.on('invite_sent', handleInviteSent);
    socket.on('invite_cancelled', handleInviteCancelled);
    socket.on('invite_declined', handleInviteDeclined);
    socket.on('invite_expired', handleInviteExpired);
    socket.on('invite_error', handleInviteError);

    return () => {
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
      socket.off('partner_declined', handlePartnerDeclined);
      socket.off('turn_ended_early', handleTurnEndedEarly);
      socket.off('partner_reconnecting', handlePartnerReconnecting);
      socket.off('partner_reconnected', handlePartnerReconnected);
      socket.off('partner_left', handlePartnerLeft);
      socket.off('session_resumed', handleSessionResumed);
      socket.off('partner_list', handlePartnerList);
      socket.off('match_mode', handleMatchMode);
      socket.off('invite_received', handleInviteReceived);
      socket.off('invite_sent', handleInviteSent);
      socket.off('invite_cancelled', handleInviteCancelled);
      socket.off('invite_declined', handleInviteDeclined);
      socket.off('invite_expired', handleInviteExpired);
      socket.off('invite_error', handleInviteError);
    };
  }, [dispatch, refs]);

  // The server takes the name and role from the signed-in account behind the
  // handshake; band is the only thing this side still gets to choose.
  // autoMatch mặc định false: vào hàng chờ nhưng máy không tự ghép, người dùng
  // tự chọn. Muốn máy ghép hộ thì phải nói rõ.
  // `focus` là phần IELTS muốn luyện; chỉ ghép được với người chọn cùng phần.
  const findMatch = useCallback((displayName, band, autoMatch = false, focus = 'full') => {
    dispatch({ type: 'SET_USER', payload: { displayName, band } });
    dispatch({ type: 'SET_MATCH_MODE', payload: autoMatch });
    dispatch({ type: 'CLEAR_MATCHMAKING' });

    // KHÔNG ngắt rồi nối lại. Bản trước làm vậy, và với server thì một lần ngắt
    // giữa phiên nghĩa là "giữ chỗ 15 giây chờ người này quay lại" — nên cú nối
    // lại ngay sau đó bị nhét thẳng về đúng cái phòng vừa rời. `find_match` gửi
    // tiếp theo thấy socket đang ở trong phòng nên bị bỏ, không một lời hồi đáp,
    // và nút "Bắt đầu ghép" trông như hỏng. Bấm lại chỉ gia hạn thêm 15 giây nữa.
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('find_match', { band, autoMatch, focus });
  }, [dispatch]);

  const cancelMatch = useCallback(() => {
    socket.emit('cancel_find_match');
    dispatch({ type: 'CLEAR_MATCHMAKING' });
    dispatch({ type: 'SET_PHASE', payload: 'lobby' });
  }, [dispatch]);

  const setMatchMode = useCallback((autoMatch) => {
    socket.emit('set_match_mode', { autoMatch });
  }, []);

  const invitePartner = useCallback((toUserId) => {
    socket.emit('invite_partner', { toUserId });
  }, []);

  const cancelInvite = useCallback(() => {
    socket.emit('cancel_invite');
  }, []);

  const respondInvite = useCallback((inviteId, accept) => {
    socket.emit('respond_invite', { inviteId, accept });
  }, []);

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

  // Người dùng chọn không vào phiên ở bước kiểm tra thiết bị. Phải gửi trước khi
  // đóng socket, cùng lý do như `leaveSession`.
  const notifyDeviceDeclined = useCallback(() => {
    if (socket.connected) {
      socket.emit('device_declined');
    }
  }, []);

  // Người nói bấm kết thúc lượt sớm. KHÔNG tự rút ngắn lượt ở máy mình — chờ
  // server phát lại, để hai bên áp đúng một con số.
  const endTurnEarly = useCallback((turnIndex, spokenMs) => {
    if (socket.connected) {
      socket.emit('end_turn_early', { turnIndex, spokenMs });
    }
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

  // Phải gọi TRƯỚC `disconnectSocket`: đóng socket rồi thì không gửi được nữa, mà
  // server không có cách nào khác để phân biệt người bấm nút thoát với người rớt
  // mạng ba giây. Không nói thì người còn lại bị bảo là mình "đang kết nối lại".
  const leaveSession = useCallback(() => {
    if (socket.connected) {
      socket.emit('leave_session');
    }
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
    setMatchMode,
    invitePartner,
    cancelInvite,
    respondInvite,
    joinMentorRoom,
    sendSignal,
    notifyDeviceReady,
    notifyDeviceFailed,
    notifyDeviceDeclined,
    endTurnEarly,
    notifyPeerConnected,
    notifyPracticeComplete,
    notifyPracticeReady,
    leaveSession,
    disconnectSocket,
    onSignal,
    onBeginSignaling,
  };
}
