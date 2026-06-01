import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useSocket } from '../hooks/useSocket';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { useWebRTC } from '../hooks/useWebRTC';
import { getSession } from '../services/api';
import { ListenerView } from '../components/session/ListenerView';
import { SpeakerView } from '../components/session/SpeakerView';
import { Part2PrepView } from '../components/session/Part2PrepView';
import { SessionBriefing } from '../components/session/SessionBriefing';
import { ErrorScreen } from '../components/ui/ErrorScreen';
import { cleanupMediaSession } from '../utils/mediaCleanup';

function getSyncedTimeline(turns, practiceStartLocalTime, now) {
  if (!Array.isArray(turns) || turns.length === 0 || !Number.isFinite(practiceStartLocalTime)) {
    return null;
  }

  const elapsedMs = Math.max(0, now - practiceStartLocalTime);
  let stepStartOffsetMs = 0;

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turn = turns[turnIndex];
    const prepDurationMs = Number(turn.prepDurationMs) || 0;
    const speakDurationMs = Number(turn.durationMs) || 0;

    if (prepDurationMs > 0) {
      const prepEndOffsetMs = stepStartOffsetMs + prepDurationMs;
      if (elapsedMs < prepEndOffsetMs) {
        return {
          phase: 'prep',
          turnIndex,
          stepStartedAtMs: practiceStartLocalTime + stepStartOffsetMs,
          isComplete: false,
        };
      }
      stepStartOffsetMs = prepEndOffsetMs;
    }

    const speakEndOffsetMs = stepStartOffsetMs + speakDurationMs;
    if (elapsedMs < speakEndOffsetMs) {
      return {
        phase: 'speaking',
        turnIndex,
        stepStartedAtMs: practiceStartLocalTime + stepStartOffsetMs,
        isComplete: false,
      };
    }
    stepStartOffsetMs = speakEndOffsetMs;
  }

  return {
    phase: 'complete',
    turnIndex: turns.length,
    stepStartedAtMs: practiceStartLocalTime + stepStartOffsetMs,
    isComplete: true,
  };
}

function SessionLoadingScreen() {
  return (
    <div className="page-center">
      <div className="animate-slide-up" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div className="spinner spinner-lg" style={{ margin: '0 auto var(--spacing-4)' }} />
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--spacing-2)' }}>
          Đang tải dữ liệu phiên
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Vui lòng chờ trong giây lát...
        </p>
      </div>
    </div>
  );
}

export default function SessionPage() {
  const { state, dispatch, refs } = useSession();
  const { sendSignal, onSignal, notifyPracticeReady, disconnectSocket } = useSocket();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const hasNavigatedToReviewRef = useRef(false);

  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0);
  const [sessionLoadStatus, setSessionLoadStatus] = useState('idle');
  const [sessionLoadError, setSessionLoadError] = useState('');
  const [sessionLoadRetry, setSessionLoadRetry] = useState(0);
  const [timelineNow, setTimelineNow] = useState(() => performance.now());

  const {
    startLocalRecording,
    stopLocalRecording,
    startRemoteRecording,
    stopRemoteRecording,
  } = useMediaRecorder();

  useWebRTC({
    sendSignal,
    onSignal,
    onRemoteStream: (stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    },
  });

  const turns = state.turns;
  const syncedTimeline = useMemo(
    () => getSyncedTimeline(turns, state.practiceStartLocalTime, timelineNow),
    [turns, state.practiceStartLocalTime, timelineNow]
  );
  const syncedTurnIndex = syncedTimeline && !syncedTimeline.isComplete
    ? syncedTimeline.turnIndex
    : state.currentTurnIndex;
  const currentTurn = turns[syncedTurnIndex];
  const myRole = state.role;
  const iAmSpeaker = currentTurn?.speakerRole === myRole;
  const shouldShowPrep = state.practiceStarted && syncedTimeline?.phase === 'prep';
  const turnStartTime = syncedTimeline?.phase === 'speaking'
    ? syncedTimeline.stepStartedAtMs
    : null;

  useEffect(() => {
    if (!state.practiceStarted || !Number.isFinite(state.practiceStartLocalTime)) {
      return undefined;
    }

    function syncTimelineNow() {
      setTimelineNow(performance.now());
    }

    syncTimelineNow();
    const id = setInterval(syncTimelineNow, 250);
    document.addEventListener('visibilitychange', syncTimelineNow);
    window.addEventListener('focus', syncTimelineNow);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', syncTimelineNow);
      window.removeEventListener('focus', syncTimelineNow);
    };
  }, [state.practiceStarted, state.practiceStartLocalTime]);

  useEffect(() => {
    if (!syncedTimeline || syncedTimeline.isComplete) {
      return;
    }

    if (state.currentTurnIndex !== syncedTimeline.turnIndex) {
      dispatch({ type: 'SET_CURRENT_TURN', payload: syncedTimeline.turnIndex });
    }
  }, [syncedTimeline, state.currentTurnIndex, dispatch]);

  useEffect(() => {
    if (!syncedTimeline?.isComplete || hasNavigatedToReviewRef.current) {
      return;
    }

    hasNavigatedToReviewRef.current = true;
    stopLocalRecording();
    stopRemoteRecording();
    cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]);
    navigate('/review');
  }, [syncedTimeline?.isComplete, navigate, refs, stopLocalRecording, stopRemoteRecording]);

  useEffect(() => {
    if (!state.sessionId) {
      return;
    }

    if (state.turns.length > 0) {
      setSessionLoadStatus('loaded');
      setSessionLoadError('');
      return;
    }

    let cancelled = false;

    async function loadSessionData() {
      setSessionLoadStatus('loading');
      setSessionLoadError('');

      try {
        const data = await getSession(state.sessionId);
        if (!cancelled) {
          dispatch({ type: 'SET_SESSION_DATA', payload: data });
          setSessionLoadStatus('loaded');
        }
      } catch (err) {
        if (!cancelled) {
          setSessionLoadError(err.message);
          setSessionLoadStatus('error');
        }
      }
    }

    loadSessionData();

    return () => {
      cancelled = true;
    };
  }, [state.sessionId, state.turns.length, sessionLoadRetry, dispatch]);

  useEffect(() => {
    function attachVideoStream(videoElement, stream) {
      if (!videoElement || !stream) {
        return;
      }

      if (videoElement.srcObject !== stream) {
        videoElement.srcObject = stream;
      }

      const playPromise = videoElement.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    }

    function attachStreams() {
      attachVideoStream(localVideoRef.current, refs.current.localStream);
      attachVideoStream(remoteVideoRef.current, refs.current.remoteStream);
    }

    function handleRemoteStreamReady() {
      attachStreams();
      setRemoteStreamVersion((version) => version + 1);
    }

    attachStreams();
    window.addEventListener('remote_stream_ready', handleRemoteStreamReady);
    window.addEventListener('local_stream_ready', attachStreams);
    return () => {
      window.removeEventListener('remote_stream_ready', handleRemoteStreamReady);
      window.removeEventListener('local_stream_ready', attachStreams);
    };
  }, [state.phase, state.currentTurnIndex, state.practiceStarted, shouldShowPrep, refs]);

  useEffect(() => {
    if (!currentTurn || shouldShowPrep || !state.practiceStarted) {
      return undefined;
    }

    if (iAmSpeaker) {
      startLocalRecording(refs.current.localStream, currentTurn.id);
    } else {
      startRemoteRecording(refs.current.remoteStream, currentTurn.id);
    }

    return () => {
      stopLocalRecording();
      stopRemoteRecording();
    };
  }, [
    currentTurn,
    shouldShowPrep,
    state.practiceStarted,
    iAmSpeaker,
    refs,
    startLocalRecording,
    startRemoteRecording,
    stopLocalRecording,
    stopRemoteRecording,
  ]);

  useEffect(() => {
    if (!currentTurn || shouldShowPrep || !state.practiceStarted || iAmSpeaker || !refs.current.remoteStream) {
      return;
    }

    startRemoteRecording(refs.current.remoteStream, currentTurn.id);
  }, [
    currentTurn,
    shouldShowPrep,
    state.practiceStarted,
    iAmSpeaker,
    remoteStreamVersion,
    refs,
    startRemoteRecording,
  ]);

  useEffect(() => {
    if (state.error?.type === 'partner_disconnected') {
      stopLocalRecording();
      stopRemoteRecording();
      cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]);
    }
  }, [state.error, refs, stopLocalRecording, stopRemoteRecording]);

  function handleTurnEnd() {
    stopLocalRecording();
    stopRemoteRecording();
    setTimelineNow(performance.now());
  }

  function handlePrepEnd() {
    setTimelineNow(performance.now());
  }

  function handlePracticeReady() {
    notifyPracticeReady();
  }

  function handleEndCall() {
    const confirmed = window.confirm(
      'Bạn có chắc muốn kết thúc cuộc trò chuyện? Phiên chưa hoàn thành sẽ không được Review và không gửi lên AI chấm.'
    );

    if (!confirmed) {
      return;
    }

    stopLocalRecording();
    stopRemoteRecording();
    cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]);
    disconnectSocket();
    dispatch({ type: 'RESET' });
    navigate('/');
    setTimeout(() => cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]), 0);
  }

  if (state.error?.type === 'partner_disconnected') {
    return (
      <ErrorScreen
        icon="link_off"
        title="Đối tác đã ngắt kết nối"
        description="Kết nối với đối tác luyện tập đã bị gián đoạn. Một số audio đã ghi có thể vẫn được lưu tạm trên thiết bị này."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]);
              dispatch({ type: 'RESET' });
              navigate('/');
            }}
          >
            Về trang chủ
          </button>
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
            Về trang chủ
          </button>
        }
      />
    );
  }

  if (turns.length === 0 && sessionLoadStatus !== 'loaded') {
    if (sessionLoadStatus === 'error') {
      return (
        <ErrorScreen
          icon="error"
          title="Không tải được dữ liệu phiên"
          description={sessionLoadError || 'Không thể lấy dữ liệu phiên luyện tập từ máy chủ.'}
          actions={
            <button className="btn btn-primary" onClick={() => setSessionLoadRetry((retry) => retry + 1)}>
              Thử lại
            </button>
          }
        />
      );
    }

    return <SessionLoadingScreen />;
  }

  if (syncedTimeline?.isComplete) {
    return <SessionLoadingScreen />;
  }

  if (!currentTurn) {
    return (
      <ErrorScreen
        icon="error"
        title="Không tìm thấy dữ liệu phiên"
        description="Dữ liệu phiên luyện tập không hợp lệ. Vui lòng thử lại."
        actions={
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Về trang chủ
          </button>
        }
      />
    );
  }

  if (!state.practiceStarted) {
    return (
      <SessionBriefing
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        partnerName={state.partnerName}
        role={state.role}
        myReady={state.practiceReady}
        partnerReady={state.partnerPracticeReady}
        onReady={handlePracticeReady}
        onEndCall={handleEndCall}
      />
    );
  }

  if (shouldShowPrep) {
    return (
      <Part2PrepView
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        turn={currentTurn}
        isSpeaker={iAmSpeaker}
        partnerName={state.partnerName}
        prepStartTime={syncedTimeline?.stepStartedAtMs}
        onPrepEnd={handlePrepEnd}
        onEndCall={handleEndCall}
      />
    );
  }

  return iAmSpeaker ? (
    <SpeakerView
      localVideoRef={localVideoRef}
      remoteVideoRef={remoteVideoRef}
      turn={currentTurn}
      totalTurns={turns.length}
      turnStartTime={turnStartTime}
      onTurnEnd={handleTurnEnd}
      onEndCall={handleEndCall}
    />
  ) : (
    <ListenerView
      remoteVideoRef={remoteVideoRef}
      localVideoRef={localVideoRef}
      turn={currentTurn}
      totalTurns={turns.length}
      turnStartTime={turnStartTime}
      onTurnEnd={handleTurnEnd}
      onEndCall={handleEndCall}
    />
  );
}
