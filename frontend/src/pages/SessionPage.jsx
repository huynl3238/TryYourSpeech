import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useSocket } from '../hooks/useSocket';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { ListenerView } from '../components/session/ListenerView';
import { SpeakerView } from '../components/session/SpeakerView';
import { Part2PrepView } from '../components/session/Part2PrepView';
import { TurnTransition } from '../components/session/TurnTransition';
import { ErrorScreen } from '../components/ui/ErrorScreen';

export default function SessionPage() {
  const { state, dispatch, refs } = useSession();
  const { onSignal } = useSocket();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [showTransition, setShowTransition] = useState(false);
  const [transitionMsg, setTransitionMsg] = useState('');
  const [turnStartTime, setTurnStartTime] = useState(null);

  const { startLocalRecording, stopLocalRecording, startRemoteRecording, stopRemoteRecording } = useMediaRecorder();

  const turns = state.turns;
  const currentTurn = turns[state.currentTurnIndex];
  const myRole = state.role;

  // Am I the speaker for this turn?
  const iAmSpeaker = currentTurn?.speakerRole === myRole;

  // Attach video refs to streams
  useEffect(() => {
    if (localVideoRef.current && refs.current.localStream) {
      localVideoRef.current.srcObject = refs.current.localStream;
    }
    if (remoteVideoRef.current && refs.current.remoteStream) {
      remoteVideoRef.current.srcObject = refs.current.remoteStream;
    }
  }, [state.phase, refs]);

  // Start recording when turn begins
  useEffect(() => {
    if (!currentTurn) return;

    setTurnStartTime(Date.now());

    if (iAmSpeaker) {
      startLocalRecording(refs.current.localStream, currentTurn.id);
    } else {
      startRemoteRecording(refs.current.remoteStream, currentTurn.id);
    }

    return () => {
      stopLocalRecording();
      stopRemoteRecording();
    };
  }, [state.currentTurnIndex]);

  // Partner disconnected
  useEffect(() => {
    if (state.error?.type === 'partner_disconnected') {
      stopLocalRecording();
      stopRemoteRecording();
    }
  }, [state.error]);

  function handleTurnEnd() {
    stopLocalRecording();
    stopRemoteRecording();

    const nextTurnIndex = state.currentTurnIndex + 1;

    if (nextTurnIndex >= turns.length) {
      // Session complete → review
      navigate('/review');
      return;
    }

    const nextTurn = turns[nextTurnIndex];
    const nextIAmSpeaker = nextTurn?.speakerRole === myRole;

    // Show transition overlay
    setTransitionMsg(nextIAmSpeaker ? 'Đến lượt bạn nói' : `Đến lượt ${state.partnerName} nói`);
    setShowTransition(true);
  }

  function handleTransitionDone() {
    setShowTransition(false);
    dispatch({ type: 'SET_CURRENT_TURN', payload: state.currentTurnIndex + 1 });
  }

  // Error state: partner disconnected
  if (state.error?.type === 'partner_disconnected') {
    return (
      <ErrorScreen
        icon="link_off"
        title="Đối tác đã ngắt kết nối"
        description="Kết nối với đối tác luyện tập đã bị gián đoạn. Một số audio đã ghi có thể vẫn được lưu tạm trên thiết bị này."
        actions={
          <>
            <button className="btn btn-primary" onClick={() => navigate('/review')}>
              <span className="material-symbols-rounded">rate_review</span>
              Chuyển sang Review
            </button>
            <button className="btn btn-secondary" onClick={() => { dispatch({ type: 'RESET' }); navigate('/'); }}>
              Về trang chủ
            </button>
          </>
        }
      />
    );
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

  // Part 2 prep screen
  if (currentTurn.partNumber === 2 && currentTurn.prepDurationMs > 0) {
    return (
      <>
        <Part2PrepView
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          turn={currentTurn}
          onPrepEnd={() => {
            // Start recording when speaking phase begins
            if (iAmSpeaker) {
              startLocalRecording(refs.current.localStream, currentTurn.id);
            } else {
              startRemoteRecording(refs.current.remoteStream, currentTurn.id);
            }
          }}
          onSpeakEnd={handleTurnEnd}
        />
        {showTransition && (
          <TurnTransition
            message={transitionMsg}
            subMessage="Chuẩn bị cho lượt tiếp theo"
            onDone={handleTransitionDone}
          />
        )}
      </>
    );
  }

  return (
    <>
      {iAmSpeaker ? (
        <SpeakerView
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          turn={currentTurn}
          turnStartTime={turnStartTime}
          onTurnEnd={handleTurnEnd}
        />
      ) : (
        <ListenerView
          remoteVideoRef={remoteVideoRef}
          localVideoRef={localVideoRef}
          turn={currentTurn}
          turnStartTime={turnStartTime}
          onTurnEnd={handleTurnEnd}
        />
      )}

      {showTransition && (
        <TurnTransition
          message={transitionMsg}
          subMessage="Chuẩn bị cho lượt tiếp theo"
          onDone={handleTransitionDone}
        />
      )}
    </>
  );
}
