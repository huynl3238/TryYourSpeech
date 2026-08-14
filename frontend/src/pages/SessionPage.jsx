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
import { TurnTransition } from '../components/session/TurnTransition';
import { SessionBriefing } from '../components/session/SessionBriefing';
import { ErrorScreen } from '../components/ui/ErrorScreen';
import { cleanupMediaSession } from '../utils/mediaCleanup';
import { getSyncedTimeline, getTurnBlockPosition } from '../utils/sessionTimeline';
import { TurnRoleBar } from '../components/session/TurnRoleBar';

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
  const {
    sendSignal,
    onSignal,
    notifyPracticeReady,
    notifyPracticeComplete,
    leaveSession,
    disconnectSocket,
  } = useSocket();
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
  const shouldShowTransition = state.practiceStarted && syncedTimeline?.phase === 'transition';
  const turnStartTime = syncedTimeline?.phase === 'speaking'
    ? syncedTimeline.stepStartedAtMs
    : null;

  // Dựng một lần ở đây rồi truyền xuống, để màn chuyển lượt, màn người nói và
  // màn người nghe không thể nói ba câu khác nhau về cùng một khoảnh khắc.
  const partnerName = state.partnerName || 'Đối tác';
  const blockPosition = currentTurn ? getTurnBlockPosition(turns, syncedTurnIndex) : null;
  const turnRoleBar = currentTurn ? (
    <TurnRoleBar
      partNumber={currentTurn.partNumber}
      blockPosition={blockPosition}
      speakerName={iAmSpeaker ? 'Bạn' : partnerName}
      listenerName={iAmSpeaker ? partnerName : 'Bạn'}
      iAmSpeaker={iAmSpeaker}
    />
  ) : null;

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
    // Retire the room before leaving for the review phase. Without this the room
    // outlived the call, and the next disconnect — a refresh, a closed tab, or
    // simply searching for a new partner — was read as abandoning a session that
    // had in fact finished, which blocked review completion and the AI with it.
    notifyPracticeComplete();
    cleanupMediaSession(refs, [localVideoRef, remoteVideoRef]);
    // Mentor sessions branch to the mentor-review flow (mentor writes feedback,
    // student reads it) instead of the peer note-review flow.
    if (state.sessionMode === 'mentor') {
      navigate('/mentor/review');
    } else {
      navigate('/review');
    }
  }, [syncedTimeline?.isComplete, navigate, refs, stopLocalRecording, stopRemoteRecording, notifyPracticeComplete, state.sessionMode]);

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
  }, [state.phase, state.currentTurnIndex, state.practiceStarted, shouldShowPrep, shouldShowTransition, refs]);

  useEffect(() => {
    if (!currentTurn || shouldShowPrep || shouldShowTransition || !state.practiceStarted) {
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
    shouldShowTransition,
    state.practiceStarted,
    iAmSpeaker,
    refs,
    startLocalRecording,
    startRemoteRecording,
    stopLocalRecording,
    stopRemoteRecording,
  ]);

  useEffect(() => {
    if (!currentTurn || shouldShowPrep || shouldShowTransition || !state.practiceStarted || iAmSpeaker || !refs.current.remoteStream) {
      return;
    }

    startRemoteRecording(refs.current.remoteStream, currentTurn.id);
  }, [
    currentTurn,
    shouldShowPrep,
    shouldShowTransition,
    state.practiceStarted,
    iAmSpeaker,
    remoteStreamVersion,
    refs,
    startRemoteRecording,
  ]);

  // Chỉ mic của người đang nói được mở. Trước đây cả hai mic mở suốt phiên nên
  // người nói nghe cả tiếng phòng của người nghe. Việc này không ảnh hưởng điểm
  // AI — mỗi người upload localStream của chính mình, tiếng người nghe không bao
  // giờ lẫn vào bản ghi của người nói — nên đây là sửa trải nghiệm.
  //
  // Chỉ áp dụng sau khi phiên đã bắt đầu, vì ở bước làm quen hai người cần nói
  // chuyện với nhau. Trong lúc luyện, nút điều khiển cũng khóa việc người nghe
  // bật mic ngược lại để không tạo vòng lặp loa -> mic giữa hai thiết bị.
  useEffect(() => {
    if (!state.practiceStarted || !refs.current.localStream) {
      return;
    }

    refs.current.localStream.getAudioTracks().forEach((track) => {
      track.enabled = iAmSpeaker;
    });

    // Nút mic đọc trạng thái trực tiếp từ track nên phải được báo là track vừa đổi.
    window.dispatchEvent(new Event('local_audio_changed'));
  }, [state.practiceStarted, iAmSpeaker, currentTurn?.id, refs]);

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

  function handleTransitionEnd() {
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
    // Trước khi đóng socket, vì đóng rồi thì không nói được nữa. Server chỉ thấy
    // socket đứt và mặc định là rớt mạng, nên nếu không nói thì đối tác bị bảo
    // "đối tác đang kết nối lại" và ngồi chờ 15 giây một người đã bỏ đi.
    leaveSession();
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
        turns={turns}
        myReady={state.practiceReady}
        partnerReady={state.partnerPracticeReady}
        onReady={handlePracticeReady}
        onEndCall={handleEndCall}
      />
    );
  }

  if (shouldShowTransition) {
    // Đồng hồ đếm ngược lấy phần còn lại của khoảng chờ chứ không phải trọn độ
    // dài của nó, để màn này không kéo dài quá timeline nếu component mount
    // muộn (đổi tab, máy chậm). Timeline vẫn là nguồn quyết định: tick 250ms sẽ
    // tự chuyển sang lượt nói dù `onDone` có kịp chạy hay không.
    const remainingGapMs = Math.max(
      0,
      syncedTimeline.stepStartedAtMs + syncedTimeline.gapMs - timelineNow
    );

    // Đổi người thì tiêu đề phải là lời báo đổi vai. Cùng người sang câu tiếp
    // mà vẫn hô "đến lượt bạn nói" thì thành nhiễu: họ đang nói dở phần của
    // mình, cái họ cần biết là câu hỏi tiếp theo.
    const message = syncedTimeline.isSpeakerChange
      ? (iAmSpeaker ? 'Đến lượt bạn nói' : `Đến lượt ${partnerName} nói`)
      : (iAmSpeaker ? 'Câu tiếp theo của bạn' : `Câu tiếp theo của ${partnerName}`);

    return (
      <TurnTransition
        message={message}
        subMessage={
          iAmSpeaker
            ? 'Mic của bạn đã được bật'
            : 'Bấm TAB để đánh dấu khi nghe'
        }
        roleBar={turnRoleBar}
        questionText={currentTurn.questionText}
        delayMs={remainingGapMs}
        onDone={handleTransitionEnd}
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
        roleBar={turnRoleBar}
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
      roleBar={turnRoleBar}
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
      roleBar={turnRoleBar}
      turnStartTime={turnStartTime}
      onTurnEnd={handleTurnEnd}
      onEndCall={handleEndCall}
    />
  );
}
