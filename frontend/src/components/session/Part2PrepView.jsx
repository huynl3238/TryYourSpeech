import { useState } from 'react';
import { Timer } from '../ui/Timer';
import { useSession } from '../../context/SessionContext';

export function Part2PrepView({ localVideoRef, remoteVideoRef, turn, onPrepEnd, onSpeakEnd }) {
  const { state } = useSession();
  const [phase, setPhase] = useState('prep'); // 'prep' | 'speaking'

  const prepMs = turn?.prepDurationMs || 60000;
  const speakMs = turn?.durationMs || 120000;

  const isSpeaker = turn?.speakerRole === state.role;

  return (
    <div className="session-layout">
      <div className="session-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          <span className="badge badge-primary">Part 2 — Cue Card</span>
          {phase === 'prep' ? (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'var(--font-size-xs)' }}>
              {isSpeaker ? 'Thời gian chuẩn bị' : 'Đối tác đang chuẩn bị'}
            </span>
          ) : (
            <span className="badge badge-speaker" style={{ gap: 4 }}>
              <span className="recording-dot" />
              {isSpeaker ? 'Bạn đang nói' : 'Đối tác đang nói'}
            </span>
          )}
        </div>

        <Timer
          durationMs={phase === 'prep' ? prepMs : speakMs}
          onEnd={() => {
            if (phase === 'prep') {
              setPhase('speaking');
              if (onPrepEnd) onPrepEnd();
            } else {
              if (onSpeakEnd) onSpeakEnd();
            }
          }}
        />

        <div style={{ fontSize: 'var(--font-size-xs)', color: 'rgba(255,255,255,0.5)' }}>
          {phase === 'prep' ? 'Chuẩn bị' : 'Nói 2 phút'}
        </div>
      </div>

      {/* Cue Card */}
      <div className="session-main" style={{ alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-8)', overflowY: 'auto' }}>
        <div style={{ maxWidth: 600, width: '100%' }}>
          {/* Topic tag */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
            background: 'rgba(37,99,235,0.2)',
            color: '#93c5fd',
            borderRadius: 'var(--radius-full)',
            padding: '4px 12px',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            marginBottom: 'var(--spacing-4)',
          }}>
            <span className="material-symbols-rounded" style={{ fontSize: 14 }}>description</span>
            IELTS Speaking · Part 2
          </div>

          {/* Cue Card box */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--spacing-8)',
            marginBottom: 'var(--spacing-5)',
          }}>
            <p style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: 'var(--font-size-xs)',
              marginBottom: 'var(--spacing-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}>
              Describe...
            </p>
            <h2 style={{
              color: 'white',
              fontSize: 'var(--font-size-xl)',
              fontWeight: 700,
              lineHeight: 1.4,
              marginBottom: 'var(--spacing-6)',
            }}>
              {turn?.questionText || 'Đang tải Cue Card...'}
            </h2>

            {turn?.cueCard && (
              <div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--spacing-3)' }}>
                  You should say:
                </p>
                <ul style={{ paddingLeft: 'var(--spacing-5)', color: 'rgba(255,255,255,0.85)', fontSize: 'var(--font-size-sm)', lineHeight: 2 }}>
                  {(Array.isArray(turn.cueCard) ? turn.cueCard : [turn.cueCard]).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Instruction */}
          <p style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: 'var(--font-size-xs)',
            textAlign: 'center',
          }}>
            {isSpeaker
              ? 'Hãy ghi chú ý tưởng trong thời gian chuẩn bị. Sau đó nói trong 2 phút.'
              : 'Đối tác của bạn đang chuẩn bị. Lắng nghe và sẵn sàng đánh dấu lỗi.'
            }
          </p>
        </div>

        {/* Video previews small */}
        <div style={{
          position: 'absolute',
          top: 'var(--spacing-4)',
          right: 'var(--spacing-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-2)',
        }}>
          <div style={{ width: 120, height: 84, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.15)', background: '#334155' }}>
            <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          </div>
          <div style={{ width: 120, height: 84, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.15)', background: '#334155' }}>
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>
      </div>

      <div className="session-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <span className="material-symbols-rounded" style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }}>info</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 'var(--font-size-xs)' }}>
            {isSpeaker
              ? 'Nói về chủ đề trên trong vòng 2 phút sau khi đồng hồ chuẩn bị kết thúc'
              : 'Nhấn TAB để đánh dấu lỗi khi đối tác bắt đầu nói'
            }
          </span>
        </div>
      </div>
    </div>
  );
}
