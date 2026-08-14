import { useEffect, useState } from 'react';
import { useSession } from '../../context/SessionContext';
import { rememberMediaStream } from '../../utils/mediaCleanup';
// Dùng thẳng socket chứ không gọi `useSocket()`: hook đó đăng ký cả một loạt trình
// nghe sự kiện trong effect của nó, gọi thêm một lần nữa ở đây là mọi sự kiện phòng
// bị xử lý hai lần. Ở đây chỉ cần gửi đi một tin, không cần nghe gì.
import { socket } from '../../services/socket';
import { canEnableMicrophoneDuringSession } from '../../utils/microphonePolicy';

function setTracksEnabled(stream, kind, enabled) {
  if (!stream) return;

  stream
    .getTracks()
    .filter((track) => track.kind === kind)
    .forEach((track) => {
      track.enabled = enabled;
    });
}

// Không có track nghĩa là thiết bị đang tắt, không phải đang bật. Trước đây hàm này
// trả về `true` khi không tìm thấy track, mà tắt camera thì track video bị tháo hẳn
// ra khỏi stream — nên cứ mỗi lần đồng bộ lại (xảy ra ở mỗi lượt nói, do phiên tự
// khoá mic người nghe) là icon camera nhảy về "đang bật" dù camera vẫn tắt, và cú
// bấm tiếp theo của người dùng hoá ra là bật camera lên ngoài ý muốn.
function getTrackEnabled(stream, kind) {
  const track = stream?.getTracks().find((item) => item.kind === kind);
  return track ? track.enabled : false;
}

function removeTracks(stream, kind) {
  if (!stream) return;

  stream
    .getTracks()
    .filter((track) => track.kind === kind)
    .forEach((track) => {
      stream.removeTrack(track);
      track.stop();
    });
}

export function SessionCallControls({ remoteVideoRef, onEndCall, compact = false }) {
  const { state, dispatch, refs } = useSession();
  const [micEnabled, setMicEnabled] = useState(() => getTrackEnabled(refs.current.localStream, 'audio'));
  const [speakerEnabled, setSpeakerEnabled] = useState(() => !remoteVideoRef?.current?.muted);
  // Camera lấy từ state dùng chung, không giữ riêng trong component: các khung video
  // ở 4 màn khác nhau đều phải biết để vẽ lớp phủ, mà nút này thì bị dựng lại mỗi
  // lần đổi màn (nói -> nghe -> chuẩn bị). Giữ riêng là mỗi bên hiểu một kiểu.
  const cameraEnabled = !state.cameraOff;
  const canEnableMic = canEnableMicrophoneDuringSession(state);

  useEffect(() => {
    setMicEnabled(getTrackEnabled(refs.current.localStream, 'audio'));
    setSpeakerEnabled(!remoteVideoRef?.current?.muted);
  }, [refs, remoteVideoRef]);

  // Phiên luyện tự tắt mic của người nghe và bật lại khi đến lượt họ nói, tức là
  // track bị đổi từ bên ngoài component này. Không đồng bộ lại thì icon vẫn hiện
  // "mic đang mở" trong khi mic đã tắt, và người dùng bấm một lần mà tưởng hỏng.
  useEffect(() => {
    function syncFromTracks() {
      setMicEnabled(getTrackEnabled(refs.current.localStream, 'audio'));
    }

    window.addEventListener('local_audio_changed', syncFromTracks);
    window.addEventListener('local_stream_ready', syncFromTracks);
    return () => {
      window.removeEventListener('local_audio_changed', syncFromTracks);
      window.removeEventListener('local_stream_ready', syncFromTracks);
    };
  }, [refs]);

  function toggleMic() {
    const nextEnabled = !micEnabled;
    if (nextEnabled && !canEnableMic) {
      return;
    }

    setTracksEnabled(refs.current.localStream, 'audio', nextEnabled);
    setMicEnabled(nextEnabled);
  }

  // Đối tác không có cách nào tự biết camera bên này vừa tắt: tháo track chỉ làm
  // luồng video ngừng chảy, mà ngừng chảy thì thẻ <video> của họ đứng lại ở khung
  // cuối chứ không báo gì. Sự kiện `mute` của track thì tuỳ trình duyệt và thường
  // trễ vài giây, nên nói thẳng cho họ biết là cách duy nhất chắc chắn.
  function announceCameraState(off) {
    socket.emit('signal', { type: 'camera_state', payload: { off } });
  }

  async function toggleCamera() {
    if (cameraEnabled) {
      removeTracks(refs.current.localStream, 'video');
      const videoSender = refs.current.peerConnection
        ?.getSenders()
        .find((sender) => sender.track?.kind === 'video');
      await videoSender?.replaceTrack(null);
      window.dispatchEvent(new Event('local_stream_ready'));
      dispatch({ type: 'SET_CAMERA_OFF', payload: true });
      announceCameraState(true);
      return;
    }

    try {
      const stream = rememberMediaStream(await navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
      const [videoTrack] = stream.getVideoTracks();
      if (!videoTrack) return;

      if (!refs.current.localStream) {
        refs.current.localStream = new MediaStream();
      }
      removeTracks(refs.current.localStream, 'video');
      refs.current.localStream.addTrack(videoTrack);

      const videoSender = refs.current.peerConnection
        ?.getSenders()
        .find((sender) => sender.track?.kind === 'video' || sender.track === null);

      if (videoSender) {
        await videoSender.replaceTrack(videoTrack);
      } else {
        refs.current.peerConnection?.addTrack(videoTrack, refs.current.localStream);
      }

      window.dispatchEvent(new Event('local_stream_ready'));
      dispatch({ type: 'SET_CAMERA_OFF', payload: false });
      announceCameraState(false);
    } catch (err) {
      console.warn('[CallControls] Could not restart camera:', err.message);
    }
  }

  function toggleSpeaker() {
    const nextEnabled = !speakerEnabled;
    if (remoteVideoRef?.current) {
      remoteVideoRef.current.muted = !nextEnabled;
    }
    setSpeakerEnabled(nextEnabled);
  }

  return (
    <div className={`session-call-controls ${compact ? 'compact' : ''}`}>
      <button
        type="button"
        className={`call-control-btn ${micEnabled ? '' : 'muted'}`}
        onClick={toggleMic}
        disabled={!micEnabled && !canEnableMic}
        aria-label={micEnabled ? 'Tắt mic' : canEnableMic ? 'Bật mic' : 'Mic bị khóa trong lượt nghe'}
        title={micEnabled ? 'Tắt mic' : canEnableMic ? 'Bật mic' : 'Mic bị khóa trong lượt nghe'}
      >
        <span className="material-symbols-rounded">{micEnabled ? 'mic' : 'mic_off'}</span>
      </button>
      <button
        type="button"
        className={`call-control-btn ${cameraEnabled ? '' : 'muted'}`}
        onClick={toggleCamera}
        aria-label={cameraEnabled ? 'Tắt camera' : 'Bật camera'}
        title={cameraEnabled ? 'Tắt camera' : 'Bật camera'}
      >
        <span className="material-symbols-rounded">{cameraEnabled ? 'videocam' : 'videocam_off'}</span>
      </button>
      <button
        type="button"
        className={`call-control-btn ${speakerEnabled ? '' : 'muted'}`}
        onClick={toggleSpeaker}
        aria-label={speakerEnabled ? 'Tắt loa' : 'Bật loa'}
        title={speakerEnabled ? 'Tắt loa' : 'Bật loa'}
      >
        <span className="material-symbols-rounded">{speakerEnabled ? 'volume_up' : 'volume_off'}</span>
      </button>
      <button
        type="button"
        className="call-control-btn danger"
        onClick={onEndCall}
        aria-label="Kết thúc cuộc trò chuyện"
        title="Kết thúc cuộc trò chuyện"
      >
        <span className="material-symbols-rounded">call_end</span>
      </button>
    </div>
  );
}
