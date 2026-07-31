import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { getSession } from '../services/api';
import { ErrorScreen } from '../components/ui/ErrorScreen';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { cleanupMediaSession } from '../utils/mediaCleanup';

// Every way a match can die before the practice starts. They share one screen
// but each carries its own title and wording from the server event, so the user
// is told which of the four actually happened.
const MATCH_FAILURE_TYPES = new Set([
  'partner_disconnected',
  'partner_not_ready',
  'partner_device_failed',
  'webrtc_failed',
]);

function StatusRow({ status, label }) {
  return (
    <div className="flex items-center gap-2.5">
      {status === 'checking' && (
        <div className="w-4 h-4 rounded-full border-2 border-zinc-300 border-t-[#D97757] animate-spin-slow" />
      )}
      {status === 'ok' && (
        <span className="material-symbols-rounded icon-fill text-emerald-500" style={{ fontSize: 18 }}>check_circle</span>
      )}
      {status === 'error' && (
        <span className="material-symbols-rounded icon-fill text-red-500" style={{ fontSize: 18 }}>error</span>
      )}
      <span className="text-sm text-zinc-700">{label}</span>
    </div>
  );
}

export default function DeviceCheckPage() {
  const { state, dispatch, refs } = useSession();
  const {
    sendSignal,
    onSignal,
    onBeginSignaling,
    notifyDeviceReady,
    notifyDeviceFailed,
    notifyPeerConnected,
    disconnectSocket,
  } = useSocket();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const hasReportedConnectedRef = useRef(false);

  const [micStatus, setMicStatus] = useState('checking');
  const [camStatus, setCamStatus] = useState('checking');
  const [permissionError, setPermissionError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [sessionLoadStatus, setSessionLoadStatus] = useState('idle');
  const [sessionLoadError, setSessionLoadError] = useState('');
  const [sessionLoadRetry, setSessionLoadRetry] = useState(0);

  const handleRemoteStream = useCallback((stream) => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
    }
  }, []);

  // `connected` is the only proof the two browsers can actually exchange media,
  // so it is the only thing allowed to tell the server the pair is ready. A
  // failure here is left to the server's connect timeout, which reports it as
  // webrtc_failed to both sides rather than as one of them disconnecting.
  const handleConnectionStateChange = useCallback((connectionState) => {
    if (connectionState === 'connected' && !hasReportedConnectedRef.current) {
      hasReportedConnectedRef.current = true;
      notifyPeerConnected();
    }
  }, [notifyPeerConnected]);

  const { initPeerConnection, addLocalTracks, startCall, getLocalStream } = useWebRTC({
    sendSignal,
    onSignal,
    onRemoteStream: handleRemoteStream,
    onConnectionStateChange: handleConnectionStateChange,
  });

  useEffect(() => {
    async function setup() {
      try {
        const stream = await getLocalStream({ audio: true, video: true });
        await initPeerConnection();
        addLocalTracks(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setMicStatus('ok');
        setCamStatus('ok');
      } catch (err) {
        console.error('[DeviceCheck] Media error:', err.message);
        cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]);
        // Was disconnectSocket(), which reached the partner as "your partner
        // left" — a lie that sent them looking for a network problem while the
        // real cause was a microphone permission on this side.
        notifyDeviceFailed();
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionError('camera_mic');
        } else if (err.name === 'NotFoundError') {
          setPermissionError('not_found');
        } else {
          setPermissionError('unknown');
        }
        setMicStatus('error');
        setCamStatus('error');
      }
    }
    if (state.sessionId) setup();
  }, [state.sessionId, getLocalStream, initPeerConnection, addLocalTracks, notifyDeviceFailed]);

  useEffect(() => {
    async function loadSession() {
      if (!state.sessionId) return;
      setSessionLoadStatus('loading');
      setSessionLoadError('');
      try {
        const data = await getSession(state.sessionId);
        dispatch({ type: 'SET_SESSION_DATA', payload: data });
        setSessionLoadStatus('loaded');
      } catch (err) {
        console.error('[DeviceCheck] Failed to load session:', err.message);
        setSessionLoadError(err.message);
        setSessionLoadStatus('error');
      }
    }
    loadSession();
  }, [state.sessionId, sessionLoadRetry, dispatch]);

  // Negotiation starts as soon as both sides press ready, not after
  // session_start. The session cannot start until this connection reports
  // `connected`, so it has to be established first — the old order had the
  // server declaring a session active before any offer had been sent.
  useEffect(() => {
    return onBeginSignaling(() => {
      const localStream = refs.current.localStream;
      if (!localStream) return;
      startCall(localStream, state.isInitiator);
    });
  }, [onBeginSignaling, startCall, state.isInitiator, refs]);

  useEffect(() => {
    if (state.phase === 'in_session') {
      navigate('/session');
    }
  }, [state.phase, navigate]);

  useEffect(() => {
    if (MATCH_FAILURE_TYPES.has(state.error?.type)) {
      cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]);
    }
  }, [state.error, refs]);

  function handleReady() {
    if (sessionLoadStatus !== 'loaded') return;
    setIsReady(true);
    notifyDeviceReady();
  }

  if (MATCH_FAILURE_TYPES.has(state.error?.type)) {
    return (
      <ErrorScreen
        icon="link_off"
        title={state.error.title || 'Không thể bắt đầu phiên'}
        description={state.error.message}
        actions={
          <Button onClick={() => { cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]); dispatch({ type: 'RESET' }); navigate('/'); }}>
            Tìm đối tác mới
          </Button>
        }
      />
    );
  }

  if (permissionError) {
    return (
      <ErrorScreen
        icon="mic_off"
        title={
          permissionError === 'camera_mic' ? 'Cần quyền truy cập Mic & Camera' :
          permissionError === 'not_found' ? 'Không tìm thấy thiết bị' : 'Lỗi truy cập thiết bị'
        }
        description={
          permissionError === 'camera_mic'
            ? 'Trình duyệt đã chặn quyền truy cập micro và camera. Vui lòng cấp quyền để tiếp tục.'
            : permissionError === 'not_found'
            ? 'Không tìm thấy mic hoặc camera trên thiết bị này.'
            : 'Đã xảy ra lỗi khi khởi động thiết bị.'
        }
        detail={
          permissionError === 'camera_mic' && (
            <div>
              <p className="font-medium mb-2">Cách bật lại quyền:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Nhấn vào biểu tượng ổ khoá ở thanh địa chỉ</li>
                <li>Chọn <strong>Cho phép</strong> cho Micro và Camera</li>
                <li>Tải lại trang</li>
              </ol>
            </div>
          )
        }
        actions={
          <>
            <Button onClick={() => window.location.reload()}>
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>refresh</span>
              Thử lại
            </Button>
            <Button variant="outline" onClick={() => { cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]); disconnectSocket(); dispatch({ type: 'RESET' }); navigate('/'); }}>
              Về trang chủ
            </Button>
          </>
        }
      />
    );
  }

  if (sessionLoadStatus === 'error') {
    return (
      <ErrorScreen
        icon="error"
        title="Không tải được dữ liệu phiên"
        description={sessionLoadError || 'Không thể lấy dữ liệu phiên luyện tập từ máy chủ.'}
        actions={
          <>
            <Button onClick={() => setSessionLoadRetry((r) => r + 1)}>
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>refresh</span>
              Thử lại
            </Button>
            <Button variant="outline" onClick={() => { cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]); disconnectSocket(); dispatch({ type: 'RESET' }); navigate('/'); }}>
              Về trang chủ
            </Button>
          </>
        }
      />
    );
  }

  if (!state.sessionId) {
    return (
      <ErrorScreen
        icon="link_off"
        title="Không tìm thấy phiên luyện tập"
        description="Phiên luyện tập không còn hiệu lực. Vui lòng tìm đối tác mới."
        actions={<Button onClick={() => { cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]); navigate('/'); }}>Tìm đối tác</Button>}
      />
    );
  }

  const partnerBand = state.sessionData?.participants?.find((p) => p.id === state.partnerId)?.band;

  return (
    <div className="min-h-screen bg-zinc-50 flex items-start justify-center px-4 py-10">
      <div className="animate-slide-up w-full max-w-[880px]">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-900">Kiểm tra thiết bị</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Phiên luyện tập cùng <span className="font-medium text-zinc-700">{state.partnerName}</span>
          </p>
        </div>

        <div className="grid grid-cols-[1fr_300px] gap-5">

          {/* Camera preview */}
          <Card className="overflow-hidden">
            <div className="aspect-video bg-zinc-900 relative">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              {camStatus === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-zinc-500">
                  <span className="material-symbols-rounded" style={{ fontSize: 40 }}>videocam_off</span>
                  <span className="text-sm mt-2">Camera không khả dụng</span>
                </div>
              )}
            </div>
            <CardContent className="py-3 px-4 flex gap-5 bg-zinc-50 border-t border-zinc-100">
              <StatusRow status={micStatus} label="Microphone" />
              <StatusRow status={camStatus} label="Camera" />
            </CardContent>
          </Card>

          {/* Right panel */}
          <div className="flex flex-col gap-4">

            {/* Partner */}
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">Đối tác</p>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-sm flex-shrink-0">
                    {state.partnerName?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{state.partnerName}</p>
                    <p className="text-xs text-zinc-400">Band {partnerBand ?? '—'}</p>
                  </div>
                </div>
                <div className={`rounded-lg px-3 py-2.5 text-xs ${state.role === 'A' ? 'bg-purple-50 text-purple-700' : 'bg-sky-50 text-sky-700'}`}>
                  <p className="font-medium">Vai trò của bạn: Người nói {state.role}</p>
                  <p className="mt-0.5 opacity-75">
                    {state.role === 'A' ? 'Bạn nói trước trong mỗi câu hỏi' : 'Đối tác nói trước, bạn nghe và ghi lỗi'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Topic */}
            {state.sessionData && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Chủ đề</p>
                  <p className="text-sm font-medium text-zinc-900">{state.sessionData.topic?.name || 'IELTS Speaking'}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{state.turns.length} lượt · Part 1, 2, 3</p>
                </CardContent>
              </Card>
            )}

            {/* Ready button */}
            <Button
              id="ready-btn"
              size="lg"
              className="w-full"
              onClick={handleReady}
              disabled={isReady || micStatus !== 'ok' || sessionLoadStatus !== 'loaded'}
            >
              {isReady ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin-slow" />
                  Đang chờ đối tác...
                </>
              ) : sessionLoadStatus !== 'loaded' ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin-slow" />
                  Đang tải...
                </>
              ) : (
                <>
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>check</span>
                  Tôi đã sẵn sàng
                </>
              )}
            </Button>

            {isReady && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 animate-fade-in">
                <p className="text-sm font-medium text-emerald-700">Bạn đã sẵn sàng</p>
                <p className="text-xs text-emerald-600 mt-0.5">Đang chờ {state.partnerName} xác nhận...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
