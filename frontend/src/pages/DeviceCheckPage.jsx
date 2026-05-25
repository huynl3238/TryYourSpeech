import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { getSession } from '../services/api';
import { ErrorScreen } from '../components/ui/ErrorScreen';

export default function DeviceCheckPage() {
  const { state, dispatch, refs } = useSession();
  const { sendSignal, onSignal, notifyPeerConnected } = useSocket();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [micStatus, setMicStatus] = useState('checking'); // checking | ok | error
  const [camStatus, setCamStatus] = useState('checking');
  const [permissionError, setPermissionError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [partnerReady, setPartnerReady] = useState(false);

  const { initPeerConnection, startCall, getLocalStream, stopAll } = useWebRTC({
    sendSignal,
    onSignal,
    onRemoteStream: (stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    },
  });

  // Get local media
  useEffect(() => {
    async function setup() {
      try {
        const stream = await getLocalStream({ audio: true, video: true });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setMicStatus('ok');
        setCamStatus('ok');
      } catch (err) {
        console.error('[DeviceCheck] Media error:', err.message);
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

      // Init WebRTC peer connection
      await initPeerConnection();
    }

    if (state.sessionId) {
      setup();
    }

    return () => {
      // cleanup streams on unmount only if navigating away from session
    };
  }, [state.sessionId]);

  // Load session data
  useEffect(() => {
    async function loadSession() {
      if (!state.sessionId) return;
      try {
        const data = await getSession(state.sessionId);
        dispatch({ type: 'SET_SESSION_DATA', payload: data });
      } catch (err) {
        console.error('[DeviceCheck] Failed to load session:', err.message);
      }
    }
    loadSession();
  }, [state.sessionId, dispatch]);

  // When session_start fires (both ready), navigate to session
  useEffect(() => {
    if (state.phase === 'in_session') {
      // Start WebRTC call
      if (refs.current.localStream) {
        startCall(refs.current.localStream, state.isInitiator);
      }
      navigate('/session');
    }
  }, [state.phase, navigate, state.isInitiator, startCall, refs]);

  function handleReady() {
    setIsReady(true);
    notifyPeerConnected();
  }

  if (permissionError) {
    return (
      <ErrorScreen
        icon="mic_off"
        title={
          permissionError === 'camera_mic' ? 'Cần quyền truy cập Mic & Camera' :
          permissionError === 'not_found' ? 'Không tìm thấy thiết bị' :
          'Lỗi truy cập thiết bị'
        }
        description={
          permissionError === 'camera_mic'
            ? 'Trình duyệt đã chặn quyền truy cập micro và camera. Vui lòng cấp quyền để tiếp tục luyện tập.'
            : permissionError === 'not_found'
            ? 'Không tìm thấy mic hoặc camera trên thiết bị này. Vui lòng kết nối thiết bị và thử lại.'
            : 'Đã xảy ra lỗi khi khởi động thiết bị. Vui lòng thử lại.'
        }
        detail={
          permissionError === 'camera_mic' && (
            <div>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Cách bật lại quyền:</p>
              <ol style={{ paddingLeft: 16, lineHeight: 2 }}>
                <li>Nhấn vào biểu tượng ổ khoá / camera ở thanh địa chỉ</li>
                <li>Chọn <strong>Cho phép</strong> cho Micro và Camera</li>
                <li>Tải lại trang</li>
              </ol>
            </div>
          )
        }
        actions={
          <>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              <span className="material-symbols-rounded">refresh</span>
              Thử lại
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>
              Về trang chủ
            </button>
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
        actions={
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Tìm đối tác
          </button>
        }
      />
    );
  }

  const StatusIcon = ({ status }) => {
    if (status === 'checking') return <div className="spinner spinner-sm" />;
    if (status === 'ok') return <span className="material-symbols-rounded" style={{ color: 'var(--color-success)', fontSize: 20 }}>check_circle</span>;
    return <span className="material-symbols-rounded" style={{ color: 'var(--color-error)', fontSize: 20 }}>error</span>;
  };

  return (
    <div className="page-center">
      <div className="animate-slide-up" style={{ width: '100%', maxWidth: 900 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-8)' }}>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--spacing-2)' }}>
            Kiểm tra thiết bị
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Phòng luyện tập · Cùng với <strong>{state.partnerName}</strong>
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--spacing-6)' }}>
          {/* Camera preview */}
          <div className="card">
            <div style={{
              aspectRatio: '16/9',
              background: '#1e293b',
              borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
              overflow: 'hidden',
              position: 'relative',
            }}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
              {camStatus === 'error' && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: '#1e293b', color: 'rgba(255,255,255,0.5)',
                }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 48, marginBottom: 8 }}>videocam_off</span>
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>Camera không khả dụng</span>
                </div>
              )}
            </div>
            <div className="card-footer" style={{ borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
              <div style={{ display: 'flex', gap: 'var(--spacing-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                  <StatusIcon status={micStatus} />
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>Microphone</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                  <StatusIcon status={camStatus} />
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>Camera</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
            {/* Partner info */}
            <div className="card">
              <div className="card-body">
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Đối tác luyện tập
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', marginBottom: 'var(--spacing-4)' }}>
                  <div style={{
                    width: 44, height: 44,
                    borderRadius: '50%',
                    background: 'var(--color-primary-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--color-primary)',
                  }}>
                    {state.partnerName?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600 }}>{state.partnerName}</p>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Band {state.sessionData?.participants?.find(p => p.id === state.partnerId)?.band ?? '—'}
                    </p>
                  </div>
                </div>

                <div style={{
                  padding: 'var(--spacing-3)',
                  background: state.role === 'A' ? 'var(--color-speaker-light)' : 'var(--color-listener-light)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                }}>
                  <p style={{ fontWeight: 600, color: state.role === 'A' ? 'var(--color-speaker)' : 'var(--color-listener)' }}>
                    Vai trò của bạn: Người nói {state.role}
                  </p>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: 4 }}>
                    {state.role === 'A' ? 'Bạn sẽ nói trước trong mỗi câu' : 'Đối tác sẽ nói trước, bạn nghe và ghi lỗi'}
                  </p>
                </div>
              </div>
            </div>

            {/* Session info */}
            {state.sessionData && (
              <div className="card">
                <div className="card-body">
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Chủ đề phiên luyện
                  </p>
                  <p style={{ fontWeight: 600 }}>{state.sessionData.topic?.name || 'IELTS Speaking'}</p>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {state.turns.length} lượt nói · Part 1, 2, 3
                  </p>
                </div>
              </div>
            )}

            {/* Ready button */}
            <button
              id="ready-btn"
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              onClick={handleReady}
              disabled={isReady || micStatus !== 'ok'}
            >
              {isReady ? (
                <>
                  <div className="spinner spinner-sm" />
                  Đang chờ đối tác...
                </>
              ) : (
                <>
                  <span className="material-symbols-rounded">check</span>
                  Tôi đã sẵn sàng
                </>
              )}
            </button>

            {isReady && (
              <div className="alert alert-success animate-fade-in">
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>check_circle</span>
                <div>
                  <p style={{ fontWeight: 600 }}>Bạn đã sẵn sàng!</p>
                  <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
                    Đang chờ đối tác xác nhận...
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
