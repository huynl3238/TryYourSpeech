import { Timer } from '../ui/Timer';
import { useSession } from '../../context/SessionContext';
import { QuestionSupportPanel } from './QuestionSupportPanel';
import { SessionCallControls } from './SessionCallControls';

export function SpeakerView({ localVideoRef, remoteVideoRef, turn, totalTurns, turnStartTime, onTurnEnd, onEndCall }) {
  const { state } = useSession();
  const totalMs = turn?.durationMs || 45000;

  return (
    <div className="session-layout">
      <div className="session-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', minWidth: 0 }}>
          <span className="badge badge-speaker" style={{ gap: 4 }}>
            <span className="recording-dot" />
            Bạn đang nói
          </span>
          <span style={{ color: '#5f6368', fontSize: 'var(--font-size-xs)' }}>
            Part {turn?.partNumber} · Lượt {turn?.turnIndex}/{totalTurns}
          </span>
        </div>

        <div className="session-timer-block compact">
          <span>Thời gian trả lời</span>
          <Timer durationMs={totalMs} startedAtMs={turnStartTime} onEnd={onTurnEnd} />
        </div>

        <SessionCallControls remoteVideoRef={remoteVideoRef} onEndCall={onEndCall} compact />
      </div>

      <div className="session-main">
        <div className="video-primary">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
          <div className="video-label">Bạn</div>

          <div className="video-self-preview">
            <video ref={remoteVideoRef} autoPlay playsInline />
            <div className="video-label" style={{ fontSize: 10 }}>{state.partnerName || 'Đối tác'}</div>
          </div>
        </div>

        <QuestionSupportPanel turn={turn} totalTurns={totalTurns} isSpeaker />
      </div>

      <div className="session-footer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flex: 1 }}>
            <span className="recording-dot" />
            <span style={{ color: '#3c4043', fontSize: 'var(--font-size-xs)', fontWeight: 700 }}>
              Đang ghi âm lượt nói của bạn
            </span>
          </div>
          <p style={{ color: '#78716c', fontSize: 'var(--font-size-xs)' }}>
            Chỉ bản ghi của bạn được lưu lại sau phiên
          </p>
        </div>
      </div>
    </div>
  );
}
