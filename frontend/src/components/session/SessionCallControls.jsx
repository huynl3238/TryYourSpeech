import { useEffect, useState } from 'react';
import { useSession } from '../../context/SessionContext';
import { rememberMediaStream } from '../../utils/mediaCleanup';

function setTracksEnabled(stream, kind, enabled) {
  if (!stream) return;

  stream
    .getTracks()
    .filter((track) => track.kind === kind)
    .forEach((track) => {
      track.enabled = enabled;
    });
}

function getTrackEnabled(stream, kind) {
  const track = stream?.getTracks().find((item) => item.kind === kind);
  return track ? track.enabled : true;
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
  const { refs } = useSession();
  const [micEnabled, setMicEnabled] = useState(() => getTrackEnabled(refs.current.localStream, 'audio'));
  const [cameraEnabled, setCameraEnabled] = useState(() => getTrackEnabled(refs.current.localStream, 'video'));
  const [speakerEnabled, setSpeakerEnabled] = useState(() => !remoteVideoRef?.current?.muted);

  useEffect(() => {
    setMicEnabled(getTrackEnabled(refs.current.localStream, 'audio'));
    setCameraEnabled(getTrackEnabled(refs.current.localStream, 'video'));
    setSpeakerEnabled(!remoteVideoRef?.current?.muted);
  }, [refs, remoteVideoRef]);

  // Phiên luyện tự tắt mic của người nghe và bật lại khi đến lượt họ nói, tức là
  // track bị đổi từ bên ngoài component này. Không đồng bộ lại thì icon vẫn hiện
  // "mic đang mở" trong khi mic đã tắt, và người dùng bấm một lần mà tưởng hỏng.
  useEffect(() => {
    function syncFromTracks() {
      setMicEnabled(getTrackEnabled(refs.current.localStream, 'audio'));
      setCameraEnabled(getTrackEnabled(refs.current.localStream, 'video'));
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
    setTracksEnabled(refs.current.localStream, 'audio', nextEnabled);
    setMicEnabled(nextEnabled);
  }

  async function toggleCamera() {
    if (cameraEnabled) {
      removeTracks(refs.current.localStream, 'video');
      const videoSender = refs.current.peerConnection
        ?.getSenders()
        .find((sender) => sender.track?.kind === 'video');
      await videoSender?.replaceTrack(null);
      window.dispatchEvent(new Event('local_stream_ready'));
      setCameraEnabled(false);
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
      setCameraEnabled(true);
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
        aria-label={micEnabled ? 'Tắt mic' : 'Bật mic'}
        title={micEnabled ? 'Tắt mic' : 'Bật mic'}
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
