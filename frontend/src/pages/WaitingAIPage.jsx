import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { getResults } from '../services/api';
import { Card, CardContent } from '../components/ui/card';

const PIPELINE_STEPS = [
  { key: 'received',     icon: 'cloud_done',       label: 'Đã nhận audio' },
  { key: 'transcribing', icon: 'transcribe',        label: 'Chuyển audio thành transcript (Whisper)' },
  { key: 'pronunciation',icon: 'record_voice_over', label: 'Chấm phát âm (Azure Speech)' },
  { key: 'feedback',     icon: 'psychology',        label: 'Đánh giá ngữ pháp, từ vựng, fluency (OpenAI)' },
  { key: 'scoring',      icon: 'calculate',         label: 'Tổng hợp điểm ước lượng IELTS' },
];

function isTerminalAiStatus(status) {
  return status === 'completed' || status === 'failed';
}

function shouldShowPipeline(status) {
  return status === 'processing' || status === 'completed';
}

export default function WaitingAIPage() {
  const { state, dispatch } = useSession();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [sessionStatus, setSessionStatus] = useState('reviewing');
  const [pollAttempts, setPollAttempts] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStepIndex((prev) => (prev < PIPELINE_STEPS.length - 1 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(id);
  }, []);

  const pollResults = useCallback(async () => {
    if (!state.sessionId || !state.userId) return;
    try {
      const results = await getResults(state.sessionId, state.userId);
      const turnResults = results.turnResults || [];
      setSessionStatus(results.status || 'reviewing');
      const allDone = turnResults.length > 0 && turnResults.every((t) => isTerminalAiStatus(t.aiStatus));
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
    const id = setTimeout(pollResults, pollAttempts === 0 ? 500 : 3000);
    return () => clearTimeout(id);
  }, [pollAttempts, pollResults]);

  const partnerDone = shouldShowPipeline(sessionStatus);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="animate-slide-up w-full max-w-md text-center">

        {/* Icon */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-50 border border-violet-100 mb-5">
          <span className="material-symbols-rounded icon-fill text-violet-600" style={{ fontSize: 28 }}>
            psychology
          </span>
        </div>

        <h1 className="text-xl font-semibold text-zinc-900 mb-1">AI đang xử lý</h1>
        <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
          Hệ thống sẽ bắt đầu khi cả hai người hoàn tất review và audio đã tải lên đủ.
        </p>

        {/* Status card */}
        <Card className="mb-4 text-left">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-rounded icon-fill text-emerald-500" style={{ fontSize: 18 }}>check_circle</span>
              <span className="text-sm text-zinc-700">Bạn đã hoàn tất review</span>
            </div>
            <div className="flex items-center gap-3">
              {partnerDone ? (
                <span className="material-symbols-rounded icon-fill text-emerald-500" style={{ fontSize: 18 }}>check_circle</span>
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-zinc-200 border-t-violet-500 animate-spin-slow flex-shrink-0" />
              )}
              <span className="text-sm text-zinc-700">
                {partnerDone
                  ? `${state.partnerName} đã hoàn tất`
                  : `Đang chờ ${state.partnerName} hoàn tất review...`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline */}
        {partnerDone && (
          <Card className="text-left animate-fade-in">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">Tiến trình xử lý</p>
              <div className="space-y-3">
                {PIPELINE_STEPS.map((step, i) => {
                  const isDone = i < stepIndex;
                  const isCurrent = i === stepIndex;
                  return (
                    <div
                      key={step.key}
                      className="flex items-center gap-3"
                      style={{ opacity: i > stepIndex ? 0.35 : 1, transition: 'opacity 0.4s' }}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isDone ? 'bg-emerald-50' : isCurrent ? 'bg-violet-50' : 'bg-zinc-50'
                      }`}>
                        {isDone ? (
                          <span className="material-symbols-rounded icon-fill text-emerald-500" style={{ fontSize: 14 }}>check</span>
                        ) : isCurrent ? (
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-200 border-t-violet-500 animate-spin-slow" />
                        ) : (
                          <span className="material-symbols-rounded text-zinc-300" style={{ fontSize: 14 }}>{step.icon}</span>
                        )}
                      </div>
                      <span className={`text-sm ${isDone ? 'text-emerald-600' : isCurrent ? 'text-zinc-900 font-medium' : 'text-zinc-400'}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="mt-5 text-xs text-zinc-400">
          Quá trình này có thể mất 1–3 phút. Vui lòng không đóng tab.
        </p>
      </div>
    </div>
  );
}
