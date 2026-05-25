import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { getResults } from '../services/api';

const PIPELINE_STEPS = [
  { key: 'received', icon: 'cloud_done', label: 'Đã nhận audio' },
  { key: 'transcribing', icon: 'transcribe', label: 'Chuyển audio thành transcript (Whisper)' },
  { key: 'pronunciation', icon: 'record_voice_over', label: 'Chấm phát âm (Azure Speech)' },
  { key: 'feedback', icon: 'psychology', label: 'Đánh giá ngữ pháp, từ vựng, fluency (OpenAI)' },
  { key: 'scoring', icon: 'calculate', label: 'Tổng hợp điểm ước lượng IELTS' },
];

export default function WaitingAIPage() {
  const { state, dispatch } = useSession();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [partnerDone, setPartnerDone] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);

  // Animate pipeline steps
  useEffect(() => {
    const id = setInterval(() => {
      setStepIndex((prev) => {
        if (prev < PIPELINE_STEPS.length - 1) return prev + 1;
        return prev;
      });
    }, 2500);
    return () => clearInterval(id);
  }, []);

  // Simulate partner done after some time, then poll for results
  useEffect(() => {
    const partnerTimer = setTimeout(() => setPartnerDone(true), 8000);
    return () => clearTimeout(partnerTimer);
  }, []);

  // Poll results
  const pollResults = useCallback(async () => {
    if (!state.sessionId || !state.userId) return;

    try {
      const results = await getResults(state.sessionId, state.userId);
      const allDone = results.turns?.every((t) => t.aiStatus === 'done' || t.aiStatus === 'failed');

      if (allDone) {
        dispatch({ type: 'SET_RESULTS', payload: results });
        navigate('/results');
        return;
      }
    } catch (err) {
      console.warn('[WaitingAI] Poll error:', err.message);
    }

    setPollAttempts((p) => p + 1);
  }, [state.sessionId, state.userId, dispatch, navigate]);

  useEffect(() => {
    if (!partnerDone) return;
    const id = setTimeout(pollResults, 3000);
    return () => clearTimeout(id);
  }, [partnerDone, pollAttempts, pollResults]);

  return (
    <div className="page-center">
      <div className="animate-slide-up" style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        {/* Icon */}
        <div style={{
          width: 72, height: 72,
          borderRadius: '50%',
          background: 'var(--color-primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto var(--spacing-5)',
          position: 'relative',
        }}>
          <span className="material-symbols-rounded icon-fill" style={{ fontSize: 36, color: 'var(--color-primary)' }}>
            psychology
          </span>
          <div style={{
            position: 'absolute', inset: -8,
            borderRadius: '50%',
            border: '2px solid var(--color-primary)',
            borderTopColor: 'transparent',
            animation: 'spin 1.5s linear infinite',
          }} />
        </div>

        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--spacing-2)' }}>
          AI đang xử lý
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-8)' }}>
          Phiên luyện đã kết thúc. AI đang phân tích phần trả lời của bạn.
        </p>

        {/* Partner status */}
        <div className="card" style={{ marginBottom: 'var(--spacing-5)', textAlign: 'left' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
              <span className="material-symbols-rounded icon-fill" style={{ fontSize: 20, color: 'var(--color-success)' }}>
                check_circle
              </span>
              <span style={{ fontSize: 'var(--font-size-sm)' }}>Bạn đã hoàn tất review</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-3)' }}>
              {partnerDone ? (
                <span className="material-symbols-rounded icon-fill" style={{ fontSize: 20, color: 'var(--color-success)' }}>check_circle</span>
              ) : (
                <div className="spinner spinner-sm" />
              )}
              <span style={{ fontSize: 'var(--font-size-sm)' }}>
                {partnerDone ? `${state.partnerName} đã hoàn tất` : `Đang chờ ${state.partnerName} hoàn tất review...`}
              </span>
            </div>
          </div>
        </div>

        {/* Pipeline steps */}
        {partnerDone && (
          <div className="card animate-fade-in" style={{ textAlign: 'left' }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Tiến trình xử lý AI
              </p>
              {PIPELINE_STEPS.map((step, i) => {
                const isDone = i < stepIndex;
                const isCurrent = i === stepIndex;
                return (
                  <div key={step.key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-3)',
                    opacity: i > stepIndex ? 0.4 : 1,
                    transition: 'opacity 0.4s',
                  }}>
                    <div style={{
                      width: 32, height: 32,
                      borderRadius: '50%',
                      background: isDone ? 'var(--color-success-light)' : isCurrent ? 'var(--color-primary-light)' : 'var(--color-surface-raised)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {isDone ? (
                        <span className="material-symbols-rounded" style={{ fontSize: 16, color: 'var(--color-success)' }}>check</span>
                      ) : isCurrent ? (
                        <div className="spinner spinner-sm" />
                      ) : (
                        <span className="material-symbols-rounded" style={{ fontSize: 16, color: 'var(--color-text-muted)' }}>{step.icon}</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: isCurrent ? 600 : 400,
                      color: isDone ? 'var(--color-success)' : isCurrent ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    }}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p style={{ marginTop: 'var(--spacing-5)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          Quá trình này có thể mất 1–3 phút. Vui lòng không đóng tab.
        </p>
      </div>
    </div>
  );
}
