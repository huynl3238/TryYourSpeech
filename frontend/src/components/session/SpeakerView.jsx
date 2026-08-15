import { useEffect, useRef, useState } from 'react';
import { Timer } from '../ui/Timer';
import { useSession } from '../../context/SessionContext';
import { QuestionSupportPanel } from './QuestionSupportPanel';
import { SessionCallControls } from './SessionCallControls';
import { CameraOffOverlay } from './CameraOffOverlay';

// Nói được chừng này mới cho kết thúc sớm. Không phải để làm khó người dùng: một
// lượt dài vài giây thì bản ghi gần như rỗng, AI không chấm nổi và điểm của cả
// bài tụt theo — mà lúc nhận kết quả thì không ai nhớ là do mình bấm nhầm.
const MIN_SPOKEN_MS_BEFORE_EARLY_END = 10000;
// Bấm lần đầu chỉ hỏi lại. Hết chừng này mà không xác nhận thì nút trở về như cũ,
// để một cú chạm nhầm không cắt mất lượt nói.
const CONFIRM_WINDOW_MS = 5000;

export function SpeakerView({ localVideoRef, remoteVideoRef, turn, totalTurns, roleBar, turnStartTime, onTurnEnd, onEndTurnEarly, onEndCall }) {
  const { state } = useSession();
  const totalMs = turn?.durationMs || 45000;
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [spokenMs, setSpokenMs] = useState(0);
  const confirmTimerRef = useRef(null);

  // Đếm riêng ở đây thay vì đọc từ `Timer`: nút cần biết đã nói bao lâu để tự mở
  // khoá, mà `Timer` chỉ hiển thị chứ không báo ra ngoài.
  useEffect(() => {
    setSpokenMs(0);

    if (!Number.isFinite(turnStartTime)) {
      return undefined;
    }

    function tick() {
      setSpokenMs(Math.max(0, performance.now() - turnStartTime));
    }

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [turnStartTime]);

  // Đổi lượt thì trạng thái hỏi lại phải mất theo, nếu không lượt sau vừa vào đã
  // thấy nút đang ở dạng "Xác nhận" và một cú chạm là mất lượt.
  useEffect(() => {
    setConfirmingEnd(false);
    clearTimeout(confirmTimerRef.current);
  }, [turn?.id]);

  useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

  const canEndEarly = typeof onEndTurnEarly === 'function'
    && Number.isFinite(turnStartTime)
    && spokenMs >= MIN_SPOKEN_MS_BEFORE_EARLY_END;
  const secondsUntilUnlocked = Math.ceil((MIN_SPOKEN_MS_BEFORE_EARLY_END - spokenMs) / 1000);

  function handleEndEarlyClick() {
    if (!canEndEarly) return;

    if (!confirmingEnd) {
      setConfirmingEnd(true);
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmingEnd(false), CONFIRM_WINDOW_MS);
      return;
    }

    clearTimeout(confirmTimerRef.current);
    setConfirmingEnd(false);
    onEndTurnEarly();
  }

  return (
    <div className="session-layout">
      <div className="session-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', minWidth: 0 }}>
          <span className="badge badge-speaker" style={{ gap: 4 }}>
            <span className="recording-dot" />
            Bạn đang nói
          </span>
          {roleBar}
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
          {state.cameraOff && <CameraOffOverlay label="Camera của bạn đang tắt" />}
          <div className="video-label">Bạn</div>

          <div className="video-self-preview">
            <video ref={remoteVideoRef} autoPlay playsInline />
            {state.partnerCameraOff && <CameraOffOverlay compact />}
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
          {typeof onEndTurnEarly === 'function' ? (
            <button
              type="button"
              id="end-turn-early-btn"
              onClick={handleEndEarlyClick}
              disabled={!canEndEarly}
              title={canEndEarly
                ? 'Kết thúc lượt nói của bạn và chuyển sang bước tiếp theo'
                : `Nói thêm ${secondsUntilUnlocked} giây nữa để có đủ dữ liệu chấm điểm`}
              className={`speaker-end-turn-btn${confirmingEnd ? ' is-confirming' : ''}`}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                {confirmingEnd ? 'help' : 'skip_next'}
              </span>
              {confirmingEnd
                ? 'Xác nhận kết thúc?'
                : canEndEarly
                  ? 'Tôi nói xong rồi'
                  : `Nói xong rồi · ${secondsUntilUnlocked}s`}
            </button>
          ) : (
            <p style={{ color: '#78716c', fontSize: 'var(--font-size-xs)' }}>
              Chỉ bản ghi của bạn được lưu lại sau phiên
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
