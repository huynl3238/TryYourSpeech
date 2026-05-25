import { Timer } from '../ui/Timer';
import { useSession } from '../../context/SessionContext';

export function SpeakerView({ localVideoRef, remoteVideoRef, turn, turnStartTime, onTurnEnd }) {
  const { state } = useSession();

  const totalMs = turn?.durationMs || 45000;

  return (
    <div className="session-layout">
      {/* Header */}
      <div className="session-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          <span className="badge badge-speaker" style={{ gap: 4 }}>
            <span className="recording-dot" />
            Bạn đang nói
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'var(--font-size-xs)' }}>
            Part {turn?.partNumber} · Câu {turn?.turnIndex}
          </span>
        </div>

        <Timer durationMs={totalMs} onEnd={onTurnEnd} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', color: 'rgba(255,255,255,0.7)', fontSize: 'var(--font-size-xs)' }}>
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>mic</span>
          Mic đang bật
        </div>
      </div>

      {/* Main: local video large */}
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

          {/* Partner preview in corner */}
          <div className="video-self-preview">
            <video ref={remoteVideoRef} autoPlay playsInline />
            <div className="video-label" style={{ fontSize: 10 }}>{state.partnerName || 'Đối tác'}</div>
          </div>
        </div>
      </div>

      {/* Question */}
      <div style={{
        background: '#1e293b',
        borderTop: '1px solid #334155',
        padding: 'var(--spacing-4) var(--spacing-5)',
      }}>
        <p style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: 'var(--font-size-xs)',
          marginBottom: 'var(--spacing-1)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Câu hỏi của bạn
        </p>
        <p style={{
          color: 'white',
          fontSize: 'var(--font-size-lg)',
          fontWeight: 600,
          lineHeight: 1.5,
        }}>
          {turn?.questionText || 'Đang tải câu hỏi...'}
        </p>
      </div>

      {/* Footer: recording notice */}
      <div className="session-footer">
        <div style={{ display: 'flex', alignItems: 'center', justify: 'space-between', gap: 'var(--spacing-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flex: 1 }}>
            <span className="recording-dot" />
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
              Đang ghi âm lượt nói của bạn
            </span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 'var(--font-size-xs)' }}>
            Audio sẽ được tải lên để AI chấm sau phiên luyện
          </p>
        </div>
      </div>
    </div>
  );
}
