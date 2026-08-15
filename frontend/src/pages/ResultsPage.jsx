import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { getBackendFileUrl, retryResults } from '../services/api';
import { resolveSessionId } from '../utils/sessionIdentity';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { PronunciationPanel } from '../components/PronunciationPanel';

// Ba tiêu chí tạo nên band tổng. Phát âm CỐ Ý không có ở đây.
//
// Đo trên 5 bài mẫu có band tham chiếu (09/08/2026): điểm phát âm quy từ Azure ra
// band cho cả 5 người đều là 7.0–7.5 trong khi band thật trải từ 4.5 đến 9.0 — nó
// gần như một hằng số. Cộng vào band tổng chỉ làm sai lệch: tỉ lệ chấm nằm trong
// 0.5 band là 40% khi có phát âm, 80% khi bỏ ra.
//
// Azure vẫn được dùng, nhưng hiển thị đúng thứ nó đo được: điểm thô 0–100 và danh
// sách từ phát âm chưa đạt. Không quy sang band nữa.
const CRITERIA = {
  fluency: { label: 'Fluency & Coherence',      color: '#2563eb' },
  lexical: { label: 'Lexical Resource',         color: '#059669' },
  grammar: { label: 'Grammar Range & Accuracy', color: '#d97706' },
};


const ERROR_TYPE_LABELS = {
  grammar_error:       { label: 'Grammar error',             color: '#f59e0b', bg: '#fffbeb' },
  collocation_issue:   { label: 'Collocation / word choice', color: '#ef4444', bg: '#fef2f2' },
  pause_filler:        { label: 'Pause / filler',            color: '#f59e0b', bg: '#fffbeb' },
  false_start:         { label: 'False start',               color: '#D97757', bg: '#fff7ed' },
  pronunciation_issue: { label: 'Pronunciation issue',       color: '#ef4444', bg: '#fef2f2' },
  advanced_vocab:      { label: 'Advanced vocab',            color: '#10b981', bg: '#ecfdf5' },
  good_connector:      { label: 'Good connector',            color: '#10b981', bg: '#ecfdf5' },
  idea_development:    { label: 'Strong idea',               color: '#10b981', bg: '#ecfdf5' },
  pronunciation:       { label: 'Phát âm',                   color: '#ef4444', bg: '#fef2f2' },
  grammar:             { label: 'Ngữ pháp',                  color: '#f59e0b', bg: '#fffbeb' },
  vocabulary:          { label: 'Từ vựng',                   color: '#10b981', bg: '#ecfdf5' },
  fluency:             { label: 'Trôi chảy',                 color: '#7c3aed', bg: '#f5f3ff' },
};

function ScoreCircle({ score, color }) {
  const num = Number.isFinite(Number(score)) ? Number(score) : null;
  const size = 56;
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct = num != null ? Math.min(num / 9, 1) : 0;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f4f4f5" strokeWidth={5} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        style={{ fill: '#18181b', fontSize: 13, fontWeight: 700, transform: `rotate(90deg)`, transformOrigin: `${size / 2}px ${size / 2}px`, fontFamily: 'inherit' }}
      >
        {num != null ? num.toFixed(1) : '-'}
      </text>
    </svg>
  );
}

const MENTOR_ASPECTS = [
  ['pronunciationComment', 'Phát âm'],
  ['grammarComment', 'Ngữ pháp'],
  ['vocabularyComment', 'Từ vựng'],
  ['fluencyComment', 'Trôi chảy'],
];

// A mentor session has no AI band — the mentor's written feedback IS the result.
// The backend has always returned it with the results; this panel is what makes
// it readable again after the tab that ran the session is gone.
function MentorReviewPanel({ review }) {
  if (!review || !review.overallComment) {
    return (
      <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-8 text-center">
        <p className="text-sm text-zinc-500">
          Phiên luyện với mentor được nhận xét trực tiếp, không dùng AI chấm điểm.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          Mentor chưa gửi nhận xét. Bạn vẫn nghe lại được từng lượt nói cùng các dấu mentor đã đánh.
        </p>
      </div>
    );
  }

  const aspects = MENTOR_ASPECTS
    .map(([key, label]) => [label, review[key]])
    .filter(([, text]) => text);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-zinc-50 border border-zinc-100 px-4 py-3">
        <p className="text-xs text-zinc-500">
          Phiên luyện với mentor được nhận xét trực tiếp, không dùng AI chấm điểm.
        </p>
      </div>

      <Card>
        <CardHeader className="pt-4 pb-3 px-4">
          <CardTitle className="text-sm font-medium text-zinc-600">Nhận xét tổng quan của mentor</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{review.overallComment}</p>
        </CardContent>
      </Card>

      {aspects.length > 0 && (
        <Card>
          <CardHeader className="pt-4 pb-3 px-4">
            <CardTitle className="text-sm font-medium text-zinc-600">Nhận xét theo từng mặt</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {aspects.map(([label, text]) => (
              <div key={label}>
                <p className="text-xs font-semibold text-zinc-500 mb-1">{label}</p>
                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {review.suggestedNextSteps && (
        <Card>
          <CardHeader className="pt-4 pb-3 px-4">
            <CardTitle className="text-sm font-medium text-zinc-600">Bước tiếp theo nên làm</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{review.suggestedNextSteps}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function normalizeTurnResults(results, sessionTurns) {
  const turnResults = results?.turnResults || results?.turns || [];
  return turnResults.map((result) => {
    const sessionTurn = sessionTurns.find((t) => t.id === result.turnId);
    return { ...sessionTurn, ...result, scores: result.scores || {}, aiFeedback: result.aiFeedback || result.feedback || {}, peerNotes: result.peerNotes || [] };
  });
}

function calculateOverallBand(turnResults) {
  const scores = turnResults.flatMap((turn) =>
    Object.keys(CRITERIA).map((key) => turn.scores?.[key]).filter((s) => Number.isFinite(Number(s))).map(Number)
  );
  if (scores.length === 0) return null;
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  return Math.round(avg * 2) / 2;
}

function getPartLabel(turn, sessionTurns) {
  if (!turn?.partNumber) return 'Lượt nói';
  if (turn.partNumber === 2) return 'Part 2 · Cue Card';
  const questionIds = [];
  for (const t of sessionTurns) {
    if (t.partNumber !== turn.partNumber) continue;
    if (!questionIds.includes(t.questionId)) questionIds.push(t.questionId);
  }
  const idx = questionIds.indexOf(turn.questionId);
  return `Part ${turn.partNumber} · Câu ${idx === -1 ? (turn.turnIndex || '') : idx + 1}`;
}

function renderFeedbackValue(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.join('\n');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

// The three criteria graded holistically by the LLM. Pronunciation is rendered
// separately from Azure acoustic data.
const FEEDBACK_CRITERIA = [
  { key: 'fluencyCoherence',          label: 'Fluency & Coherence',      color: '#2563eb' },
  { key: 'lexicalResource',           label: 'Lexical Resource',         color: '#059669' },
  { key: 'grammaticalRangeAccuracy',  label: 'Grammar Range & Accuracy', color: '#d97706' },
];

function hasStructuredFeedback(feedback) {
  return !!(feedback && (feedback.criteria || feedback.overall));
}

function BandChip({ band, color }) {
  const num = Number.isFinite(Number(band)) ? Number(band) : null;
  return (
    <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full text-white" style={{ background: color }}>
      {num != null ? num.toFixed(1) : '-'}
    </span>
  );
}

function CriterionFeedback({ label, color, band, feedback, evidence }) {
  if (!feedback && !evidence && band == null) return null;
  return (
    <div className="rounded-lg border border-zinc-100 p-3" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold text-zinc-700">{label}</span>
        <BandChip band={band} color={color} />
      </div>
      {feedback && <p className="text-sm text-zinc-700 leading-relaxed">{feedback}</p>}
      {evidence && <p className="text-xs text-zinc-400 mt-1 italic">Dẫn chứng: {evidence}</p>}
    </div>
  );
}

function StructuredFeedback({ feedback }) {
  const overall = feedback.overall || {};
  const criteria = feedback.criteria || {};

  return (
    <div className="space-y-4">
      {overall.summary && <p className="text-sm text-zinc-700 leading-relaxed">{overall.summary}</p>}

      {overall.strengths?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Điểm mạnh</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {overall.strengths.map((item, i) => <li key={i} className="text-sm text-zinc-700">{item}</li>)}
          </ul>
        </div>
      )}

      {overall.improvements?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Cần cải thiện</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {overall.improvements.map((item, i) => <li key={i} className="text-sm text-zinc-700">{item}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-3 pt-1">
        {FEEDBACK_CRITERIA.map(({ key, label, color }) => {
          const c = criteria[key] || {};
          return (
            <CriterionFeedback
              key={key}
              label={label}
              color={color}
              band={c.band}
              feedback={c.feedback}
              evidence={c.evidence}
            />
          );
        })}

      </div>
    </div>
  );
}

export default function ResultsPage() {
  const { state, dispatch } = useSession();
  const navigate = useNavigate();
  const results = state.results;
  const resultSessionId = resolveSessionId({
    sessionId: state.sessionId,
    sessionData: state.sessionData,
    results,
  });
  const turnResults = useMemo(() => normalizeTurnResults(results, state.turns), [results, state.turns]);
  // 'summary' = the whole-test holistic overview; otherwise a turnId for per-answer detail.
  const [selectedTurnId, setSelectedTurnId] = useState('summary');
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  // If we landed here without any session context (e.g. a hard refresh cleared
  // the in-memory state), there is nothing to load — send the user home instead
  // of leaving the spinner up forever.
  useEffect(() => {
    if (!results && !state.sessionId) {
      navigate('/', { replace: true });
    }
  }, [results, state.sessionId, navigate]);

  if (!results) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-200 border-t-[#D97757] animate-spin-slow mx-auto mb-3" />
          <p className="text-sm text-zinc-400">Đang tải kết quả...</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => { dispatch({ type: 'RESET' }); navigate('/'); }}>
            Về trang chủ
          </Button>
        </div>
      </div>
    );
  }

  const selectedTurnResult = turnResults.find((t) => t.turnId === selectedTurnId);
  const holistic = results.holistic || null;
  const holisticStatus = holistic?.status || 'processing';
  const overallBand = holistic?.overallBand ?? null;
  const isMentorSession = results.sessionMode === 'mentor';

  // Opening the results from the practice history only restores sessionData, not
  // the live match state, so state.partnerName can be empty there. The session
  // detail always carries both participants, so read the other person from it.
  const partnerLabel = state.sessionData?.participants?.find((person) => person.id !== state.userId)
    ?.displayName
    || state.partnerName
    || (isMentorSession ? 'mentor' : 'bạn luyện');

  // Holistic scoring grades the whole test at once, so retry is session-level, not per-turn.
  async function handleRetry() {
    if (!resultSessionId) {
      setRetryError('Không tìm thấy mã phiên luyện tập. Vui lòng quay lại lịch sử và mở kết quả lần nữa.');
      return;
    }

    setRetryError('');
    setRetrying(true);
    try {
      await retryResults({ sessionId: resultSessionId, userId: state.userId });
      navigate('/waiting-review');
    } catch (err) {
      console.error('[Results] Retry failed:', err.message);
      setRetryError(err.message || 'Không thể yêu cầu AI chấm lại lúc này.');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-zinc-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { dispatch({ type: 'RESET' }); navigate('/'); }}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-zinc-200 text-[13.5px] font-semibold text-zinc-600 hover:border-[#EAC7B9] hover:text-[#B5674A] hover:bg-[#F7ECE6] transition-colors"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_back</span>
            Quay lại
          </button>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-rounded text-zinc-500" style={{ fontSize: 20 }}>analytics</span>
            <div>
              <h1 className="text-sm font-semibold text-zinc-900">Kết quả phiên luyện</h1>
              <p className="text-xs text-zinc-400">
                {isMentorSession
                  ? 'Nhận xét của mentor · Phiên này không dùng AI chấm điểm'
                  : 'Điểm ước lượng · Không phải điểm IELTS chính thức'}
              </p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { dispatch({ type: 'RESET' }); navigate('/'); }}>
          <span className="material-symbols-rounded" style={{ fontSize: 15 }}>add</span>
          Phiên mới
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <div className="w-60 flex-shrink-0 border-r border-zinc-200 bg-white overflow-y-auto p-3 flex flex-col gap-1">

          {/* Overall band. A mentor session has no AI band at all, so showing a
              dash next to "Đang chấm..." would promise a score that never comes. */}
          {isMentorSession ? (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-center mb-2">
              <p className="text-xs text-zinc-400 mb-1 font-medium uppercase tracking-wide">Phiên mentor</p>
              <span className="material-symbols-rounded text-[#D97757]" style={{ fontSize: 34 }}>rate_review</span>
              <p className="text-[10px] text-zinc-400 mt-1">Nhận xét trực tiếp, không có band AI</p>
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-center mb-2">
              <p className="text-xs text-zinc-400 mb-1 font-medium uppercase tracking-wide">Band ước lượng</p>
              <p className="text-4xl font-bold text-zinc-900 tabular-nums">
                {holisticStatus === 'completed' ? (overallBand ?? '-') : '-'}
              </p>
              <p className="text-[10px] text-zinc-400 mt-1">
                {holisticStatus === 'completed' ? 'Chấm cả bài' : holisticStatus === 'failed' ? 'AI gặp lỗi' : 'Đang chấm...'}
              </p>
            </div>
          )}

          {/* Whole-test summary entry */}
          <button
            onClick={() => setSelectedTurnId('summary')}
            className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors mb-2 ${
              selectedTurnId === 'summary' ? 'border-[#EAC7B9] bg-[#F7ECE6]' : 'border-transparent hover:bg-zinc-50'
            }`}
          >
            <p className={`text-xs font-semibold mb-0.5 ${selectedTurnId === 'summary' ? 'text-[#D97757]' : 'text-zinc-600'}`}>
              {isMentorSession ? 'Nhận xét của mentor' : 'Tổng quan cả bài'}
            </p>
            {isMentorSession ? (
              <span className={`text-xs ${results.mentorReview?.overallComment ? 'text-emerald-600' : 'text-zinc-400'}`}>
                {results.mentorReview?.overallComment ? 'Đã có nhận xét' : 'Chờ mentor nhận xét'}
              </span>
            ) : (
              <span className={`text-xs ${holisticStatus === 'completed' ? 'text-emerald-600' : holisticStatus === 'failed' ? 'text-red-500' : 'text-zinc-400'}`}>
                {holisticStatus === 'completed' ? 'Đã chấm' : holisticStatus === 'failed' ? 'AI lỗi' : 'Đang xử lý...'}
              </span>
            )}
          </button>

          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide px-1 mb-1">Các lượt nói</p>
          {turnResults.map((turn) => {
            const isSelected = turn.turnId === selectedTurnId;
            const hasFailed = turn.aiStatus === 'failed';
            return (
              <button
                key={turn.turnId}
                onClick={() => setSelectedTurnId(turn.turnId)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  isSelected ? 'border-[#EAC7B9] bg-[#F7ECE6]' : hasFailed ? 'border-red-100 bg-red-50' : 'border-transparent hover:bg-zinc-50'
                }`}
              >
                <p className={`text-xs font-medium mb-0.5 ${isSelected ? 'text-[#D97757]' : hasFailed ? 'text-red-600' : 'text-zinc-500'}`}>
                  {getPartLabel(turn, state.turns)}
                </p>
                <span className={`text-xs ${turn.aiStatus === 'completed' ? 'text-emerald-600' : hasFailed ? 'text-red-500' : 'text-zinc-400'}`}>
                  {isMentorSession
                    ? `${turn.peerNotes.length} dấu`
                    : turn.aiStatus === 'completed' ? 'Đã xử lý' : hasFailed ? 'AI lỗi' : 'Đang xử lý...'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedTurnId === 'summary' ? (
            <div className="max-w-2xl mx-auto space-y-5">

              <div>
                <Badge variant="secondary" className="mb-2">Cả bài</Badge>
                <h2 className="text-base font-semibold text-zinc-900 leading-snug">
                  {isMentorSession ? 'Nhận xét của mentor' : 'Đánh giá tổng thể'}
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  {isMentorSession
                    ? 'Kết quả của phiên mentor là nhận xét do mentor viết. Chọn từng lượt nói bên trái để nghe lại cùng các dấu mentor đã đánh.'
                    : 'Fluency, Lexical và Grammar được chấm một lần cho toàn bộ bài nói. Phát âm hiển thị riêng bên dưới, không tính vào band tổng.'}
                </p>
              </div>

              {isMentorSession ? (
                <MentorReviewPanel review={results.mentorReview} />
              ) : holisticStatus === 'failed' ? (
                <div className="rounded-lg bg-red-50 border border-red-100 p-4">
                  <p className="text-sm font-medium text-red-800 mb-1">AI chưa chấm được bài này</p>
                  <p className="text-xs text-red-700 mb-3">
                    {holistic?.error || 'Dịch vụ AI tạm thời gặp lỗi.'} Bạn có thể thử lại.
                  </p>
                  <Button variant="destructive" size="sm" disabled={retrying || !resultSessionId} onClick={handleRetry}>
                    {retrying
                      ? <><div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin-slow" /> Đang thử...</>
                      : <><span className="material-symbols-rounded" style={{ fontSize: 12 }}>refresh</span> Chấm lại cả bài</>
                    }
                  </Button>
                  {(retryError || !resultSessionId) && (
                    <p className="text-xs text-red-700 mt-2">
                      {retryError || 'Không tìm thấy mã phiên luyện tập. Vui lòng quay lại lịch sử và mở kết quả lần nữa.'}
                    </p>
                  )}
                </div>
              ) : holisticStatus !== 'completed' ? (
                <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-8 text-center">
                  <div className="w-8 h-8 rounded-full border-2 border-zinc-200 border-t-[#D97757] animate-spin-slow mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">AI đang chấm cả bài...</p>
                </div>
              ) : (
                <>
                  {/* Scores */}
                  <Card>
                    <CardHeader className="pt-4 pb-3 px-4">
                      <CardTitle className="text-sm font-medium text-zinc-600">Điểm 3 tiêu chí IELTS</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(CRITERIA).map(([key, { label, color }]) => {
                          const score = holistic.scores?.[key];
                          return (
                            <div key={key} className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2.5">
                              <ScoreCircle score={score} color={color} />
                              <div>
                                <p className="text-xs font-medium text-zinc-700 leading-tight">{label}</p>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                  {score != null ? `${score}/9` : 'Chưa có'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-3 text-center">
                        Điểm ước lượng, không phải điểm IELTS chính thức
                      </p>
                    </CardContent>
                  </Card>

                  {/* AI Feedback */}
                  {hasStructuredFeedback(holistic.feedback) && (
                    <Card>
                      <CardHeader className="pt-4 pb-3 px-4">
                        <CardTitle className="text-sm font-medium text-zinc-600">Nhận xét từ AI</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-4">
                        <StructuredFeedback feedback={holistic.feedback} />
                      </CardContent>
                    </Card>
                  )}

                  {/* Phát âm để riêng, không nằm trong band tổng. Gộp chi tiết
                      từng từ của MỌI lượt nói lại: người học cần biết mình hay sai
                      từ nào trong cả bài, không phải từng câu một. */}
                  <PronunciationPanel
                    pronunciation={holistic.feedback?.pronunciation}
                    words={turnResults.flatMap((turn) => turn.pronunciationDetail || [])}
                  />
                </>
              )}

            </div>
          ) : selectedTurnResult ? (
            <div className="max-w-2xl mx-auto space-y-5">

              <div>
                <Badge variant="secondary" className="mb-2">{getPartLabel(selectedTurnResult, state.turns)}</Badge>
                <h2 className="text-base font-semibold text-zinc-900 leading-snug">{selectedTurnResult.questionText}</h2>
              </div>

              {/* AI failed notice */}
              {selectedTurnResult.aiStatus === 'failed' && (
                <div className="rounded-lg bg-red-50 border border-red-100 p-4">
                  <p className="text-sm font-medium text-red-800 mb-1">AI chưa xử lý được lượt này</p>
                  <p className="text-xs text-red-700">Mở mục "Tổng quan cả bài" để chấm lại toàn bộ.</p>
                </div>
              )}

              {/* Audio */}
              <Card>
                <CardHeader className="pt-4 pb-3 px-4">
                  <CardTitle className="text-sm font-medium text-zinc-600">Nghe lại câu trả lời</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {selectedTurnResult.audioUrl ? (
                    <audio src={getBackendFileUrl(selectedTurnResult.audioUrl)} controls className="w-full" />
                  ) : (
                    <p className="text-sm text-zinc-400">Audio chưa khả dụng</p>
                  )}
                </CardContent>
              </Card>

              {/* Transcript */}
              {selectedTurnResult.transcript && (
                <Card>
                  <CardHeader className="pt-4 pb-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-600">Transcript</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-sm text-zinc-700 leading-relaxed">{selectedTurnResult.transcript}</p>
                  </CardContent>
                </Card>
              )}

              {/* Peer notes */}
              {selectedTurnResult.peerNotes?.length > 0 && (
                <Card>
                  <CardHeader className="pt-4 pb-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-600">
                      Ghi chú từ {partnerLabel} ({selectedTurnResult.peerNotes.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2.5">
                    {[...selectedTurnResult.peerNotes]
                      .sort((a, b) => a.timestampMs - b.timestampMs)
                      .map((note, i) => {
                        const cfg = ERROR_TYPE_LABELS[note.errorType] || {};
                        return (
                          <div
                            key={`${note.timestampMs}-${i}`}
                            className="rounded-md border border-zinc-100 px-3 py-2.5"
                            style={{ borderLeft: `3px solid ${cfg.color || '#a1a1aa'}` }}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label || note.errorType}</span>
                              <span className="text-xs text-zinc-400">lúc {Math.round(note.timestampMs / 1000)}s</span>
                            </div>
                            {note.noteText && <p className="text-sm text-zinc-700">{note.noteText}</p>}
                          </div>
                        );
                      })}
                  </CardContent>
                </Card>
              )}

            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-zinc-400">
              Chọn một lượt nói để xem kết quả
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
