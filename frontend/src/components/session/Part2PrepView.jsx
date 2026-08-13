import { useState } from 'react';
import { Timer } from '../ui/Timer';
import { SessionCallControls } from './SessionCallControls';
import { CameraOffOverlay } from './CameraOffOverlay';
import { useSession } from '../../context/SessionContext';

function getCueCardItems(cueCard) {
  if (!cueCard) return [];
  if (Array.isArray(cueCard)) return cueCard;
  if (Array.isArray(cueCard.bullet_points)) return cueCard.bullet_points;
  return [];
}

function getPrepLabel(partNumber) {
  if (partNumber === 1) return 'Chuẩn bị Part 1';
  if (partNumber === 2) return 'Chuẩn bị Part 2';
  return 'Chuẩn bị Part 3';
}

function getPrepGuide(partNumber) {
  if (partNumber === 1) {
    return {
      time: '30 giây chuẩn bị',
      focus: 'Chuẩn bị ý chính và một ví dụ ngắn.',
      structure: 'Answer -> Reason -> Example.',
    };
  }

  if (partNumber === 2) {
    return {
      time: '60 giây chuẩn bị',
      focus: 'Ghi nhớ từ khóa, không viết cả câu.',
      structure: 'Who/What -> Context -> Details -> Why it matters.',
    };
  }

  return {
    time: '30 giây chuẩn bị',
    focus: 'Chọn quan điểm rõ ràng và chuẩn bị 1-2 luận điểm.',
    structure: 'Opinion -> Reason -> Example -> Conclusion.',
  };
}

export function Part2PrepView({
  localVideoRef,
  remoteVideoRef,
  turn,
  isSpeaker,
  partnerName,
  prepStartTime,
  onPrepEnd,
  onEndCall,
}) {
  const { state } = useSession();
  const [showPrepWindow, setShowPrepWindow] = useState(true);
  const prepMs = turn?.prepDurationMs || 60000;
  const cueItems = getCueCardItems(turn?.cueCard);
  const phrases = Array.isArray(turn?.suggestedPhrases) ? turn.suggestedPhrases : [];
  const guide = getPrepGuide(turn?.partNumber);

  return (
    <div className="session-layout">
      <div className="session-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          <span className="mode-pill prep">
            <span className="material-symbols-rounded" style={{ fontSize: 14 }}>edit_note</span>
            {getPrepLabel(turn?.partNumber)}
          </span>
          <span style={{ color: '#5f6368', fontSize: 'var(--font-size-xs)' }}>
            {isSpeaker ? 'Bạn sắp trả lời' : `${partnerName || 'Đối tác'} sắp trả lời`} · Chưa ghi âm
          </span>
        </div>

        <div className="session-timer-block compact">
          <span>Thời gian chuẩn bị</span>
          <Timer durationMs={prepMs} startedAtMs={prepStartTime} onEnd={onPrepEnd} />
        </div>

        <SessionCallControls remoteVideoRef={remoteVideoRef} onEndCall={onEndCall} compact />
      </div>

      <div className="warmup-stage prep-video-stage">
        <section className="warmup-video-pane">
          <video ref={localVideoRef} autoPlay playsInline muted />
          {state.cameraOff && <CameraOffOverlay label="Camera của bạn đang tắt" />}
          <div className="video-label">Bạn</div>
        </section>

        <section className="warmup-video-pane">
          <video ref={remoteVideoRef} autoPlay playsInline />
          {state.partnerCameraOff && (
            <CameraOffOverlay label={`${partnerName || 'Đối tác'} đã tắt camera`} />
          )}
          <div className="video-label">{partnerName || 'Đối tác'}</div>
        </section>

        {showPrepWindow && (
          <aside className="warmup-guide-window prep-guide-window">
            <div className="warmup-guide-titlebar">
              <div>
                <div className="session-eyebrow">{isSpeaker ? 'Lượt của bạn' : 'Lượt của đối tác'}</div>
                <h2>{turn?.questionText || 'Đang tải câu hỏi...'}</h2>
              </div>
              <button
                type="button"
                className="warmup-guide-close"
                aria-label="Đóng khung chuẩn bị"
                onClick={() => setShowPrepWindow(false)}
              >
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            {cueItems.length > 0 && (
              <div className="cue-card-box large">
                <p>You should say:</p>
                <ul>
                  {cueItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="session-info-band">
              <div>
                <strong>{guide.time}</strong>
                <span>{guide.focus}</span>
              </div>
              <div>
                <strong>{turn?.durationMs ? Math.round(turn.durationMs / 1000) : 60} giây nói</strong>
                <span>{isSpeaker ? 'Sau bước này, hệ thống sẽ bắt đầu lượt trả lời của bạn.' : 'Sau bước này, bạn nghe và bấm TAB để ghi lỗi.'}</span>
              </div>
              <div>
                <strong>Cấu trúc gợi ý</strong>
                <span>{guide.structure}</span>
              </div>
            </div>

            <details className="phrases-panel prep-phrases" open>
              <summary>
                <span>Cụm từ có thể dùng</span>
                <span className="material-symbols-rounded">expand_more</span>
              </summary>
              {phrases.length > 0 ? (
                <ul>
                  {phrases.map((phrase) => (
                    <li key={phrase}>{phrase}</li>
                  ))}
                </ul>
              ) : (
                <p>Chưa có cụm từ gợi ý cho câu hỏi này.</p>
              )}
            </details>
          </aside>
        )}

        {!showPrepWindow && (
          <button
            type="button"
            className="warmup-guide-reopen prep-guide-reopen"
            onClick={() => setShowPrepWindow(true)}
          >
            <span className="material-symbols-rounded">edit_note</span>
            Mở câu hỏi
          </button>
        )}
      </div>
    </div>
  );
}
