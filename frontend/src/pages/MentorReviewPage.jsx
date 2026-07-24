import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { getResults, submitMentorReview } from '../services/api';

const CRITERIA_FIELDS = [
  { key: 'pronunciationComment', label: 'Phát âm', placeholder: 'Nhận xét về phát âm, trọng âm, ngữ điệu…' },
  { key: 'grammarComment', label: 'Ngữ pháp', placeholder: 'Cấu trúc câu, độ chính xác, thì…' },
  { key: 'vocabularyComment', label: 'Từ vựng', placeholder: 'Vốn từ, collocation, độ tự nhiên…' },
  { key: 'fluencyComment', label: 'Trôi chảy', placeholder: 'Tốc độ, mạch lạc, nối ý…' },
];

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function MentorTurnReviewList({ turns, audioByTurnId }) {
  const [audioUrls, setAudioUrls] = useState({});

  useEffect(() => {
    const nextUrls = {};

    for (const turn of turns || []) {
      const blob = audioByTurnId?.[turn.id];
      if (blob) {
        nextUrls[turn.id] = URL.createObjectURL(blob);
      }
    }

    setAudioUrls(nextUrls);

    return () => {
      Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [turns, audioByTurnId]);

  if (!Array.isArray(turns) || turns.length === 0) {
    return null;
  }

  return (
    <section className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-5 mb-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Audio học viên</div>
          <h2 className="text-base font-bold text-[#1C1917] mt-1">Xem lại phần trả lời</h2>
        </div>
        <span className="text-xs text-[#78716C] tabular-nums">{turns.length} lượt nói</span>
      </div>

      <div className="flex flex-col gap-3">
        {turns.map((turn) => {
          const audioUrl = audioUrls[turn.id];

          return (
            <article key={turn.id} className="rounded-xl border border-[#F1EEEA] bg-[#FAFAF8] p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9]">
                  Part {turn.partNumber}
                </span>
                <span className="text-[11px] text-[#78716C]">Thời lượng {formatDuration(turn.durationMs)}</span>
              </div>

              <p className="text-sm font-semibold text-[#1C1917] leading-relaxed">{turn.questionText}</p>

              {turn.cueCard?.bullet_points?.length > 0 && (
                <ul className="mt-2 text-[13px] text-[#57534E] list-disc pl-5 space-y-1">
                  {turn.cueCard.bullet_points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              )}

              {audioUrl ? (
                <audio controls src={audioUrl} className="w-full mt-3" />
              ) : (
                <p className="text-[12.5px] text-[#A8A29E] mt-3">
                  Chưa có audio local cho lượt này. Audio có thể mất nếu tab đã được refresh sau phiên.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// --- Mentor writes the review ---
function MentorReviewForm({ sessionId, mentorId, studentId, studentName, turns, audioByTurnId }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    overallComment: '',
    pronunciationComment: '',
    grammarComment: '',
    vocabularyComment: '',
    fluencyComment: '',
    suggestedNextSteps: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.overallComment.trim()) {
      setError('Vui lòng nhập nhận xét tổng quan');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitMentorReview({ sessionId, mentorId, studentId, ...form });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#FAFAF8] p-6">
        <div className="w-full max-w-md bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[#ECFDF5] text-[#059669] grid place-items-center mx-auto mb-4">
            <span className="material-symbols-rounded icon-fill" style={{ fontSize: 30 }}>check_circle</span>
          </div>
          <h1 className="text-lg font-bold text-[#1C1917]">Đã gửi nhận xét</h1>
          <p className="text-sm text-[#78716C] mt-1.5">{studentName || 'Học viên'} đã nhận được thông báo và có thể xem nhận xét của bạn.</p>
          <button onClick={() => navigate('/mentor/host')} className="mt-6 h-11 px-6 rounded-xl bg-[#D97757] text-white font-semibold text-sm hover:brightness-105">
            Về phiên của tôi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] py-8 px-6">
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Nhận xét học viên</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1C1917] mt-1">Đánh giá phiên với {studentName || 'học viên'}</h1>
          <p className="text-sm text-[#78716C] mt-1">Viết nhận xét để học viên biết điểm mạnh và hướng cải thiện.</p>
        </div>

        <MentorTurnReviewList turns={turns} audioByTurnId={audioByTurnId} />

        <div className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-5 flex flex-col gap-5">
          <div>
            <label className="block text-[13px] font-semibold text-[#1C1917] mb-2">Nhận xét tổng quan <span className="text-[#D97757]">*</span></label>
            <textarea
              value={form.overallComment}
              onChange={(e) => { update('overallComment', e.target.value); setError(''); }}
              rows={4}
              placeholder="Tổng quan về phần trình bày của học viên…"
              className="w-full rounded-lg border border-[#EAE7E3] p-3 text-sm leading-relaxed resize-y focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {CRITERIA_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block text-[13px] font-semibold text-[#1C1917] mb-2">{field.label}</label>
                <textarea
                  value={form[field.key]}
                  onChange={(e) => update(field.key, e.target.value)}
                  rows={3}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-[#EAE7E3] p-3 text-sm leading-relaxed resize-y focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#1C1917] mb-2">Bước tiếp theo nên làm</label>
            <textarea
              value={form.suggestedNextSteps}
              onChange={(e) => update('suggestedNextSteps', e.target.value)}
              rows={3}
              placeholder="Gợi ý luyện tập tiếp theo cho học viên…"
              className="w-full rounded-lg border border-[#EAE7E3] p-3 text-sm leading-relaxed resize-y focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={() => navigate('/mentor/host')} className="h-11 px-5 rounded-xl border border-[#EAE7E3] text-sm font-semibold text-[#57534E] hover:bg-[#F1EEEA]">
            Để sau
          </button>
          <button type="submit" disabled={submitting} className="h-11 px-6 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105 disabled:opacity-60">
            {submitting ? 'Đang gửi…' : 'Gửi nhận xét cho học viên'}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Student reads the mentor review ---
function StudentReviewView({ sessionId, userId }) {
  const navigate = useNavigate();
  const [review, setReview] = useState(null);
  const [status, setStatus] = useState('loading');

  async function load() {
    setStatus('loading');
    try {
      const data = await getResults(sessionId, userId);
      setReview(data?.mentorReview || null);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId]);

  const blocks = review
    ? [
        { label: 'Phát âm', text: review.pronunciationComment },
        { label: 'Ngữ pháp', text: review.grammarComment },
        { label: 'Từ vựng', text: review.vocabularyComment },
        { label: 'Trôi chảy', text: review.fluencyComment },
      ].filter((b) => b.text)
    : [];

  return (
    <div className="min-h-screen bg-[#FAFAF8] py-8 px-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 h-10 px-4 mb-5 rounded-xl border border-[#EAE7E3] bg-white text-[13.5px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] hover:bg-[#FBF4EF] transition-colors">
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_back</span>
          Về trang chính
        </button>
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Nhận xét từ Mentor</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1C1917] mt-1">Kết quả phiên với mentor</h1>
        </div>

        {status === 'loading' && <div className="text-center py-16 text-sm text-[#78716C]">Đang tải nhận xét…</div>}

        {status !== 'loading' && !review && (
          <div className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-[#F7ECE6] text-[#D97757] grid place-items-center mx-auto mb-4">
              <span className="material-symbols-rounded" style={{ fontSize: 28 }}>hourglass_top</span>
            </div>
            <h2 className="font-bold text-[#1C1917]">Đang chờ mentor nhận xét</h2>
            <p className="text-sm text-[#78716C] mt-1.5">Mentor sẽ gửi nhận xét sau phiên. Bạn sẽ nhận được thông báo khi có.</p>
            <button onClick={load} className="mt-5 h-10 px-5 rounded-lg bg-[#D97757] text-white text-sm font-semibold hover:brightness-105">Tải lại</button>
          </div>
        )}

        {review && (
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-5">
              <div className="text-[11px] uppercase tracking-wide text-[#78716C] font-bold mb-2">Nhận xét tổng quan</div>
              <p className="text-[14px] text-[#1C1917] leading-relaxed">{review.overallComment}</p>
            </div>

            {blocks.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-4">
                {blocks.map((b) => (
                  <div key={b.label} className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-4">
                    <div className="text-[13px] font-bold text-[#8A4A33] mb-1.5">{b.label}</div>
                    <p className="text-[13px] text-[#57534E] leading-relaxed">{b.text}</p>
                  </div>
                ))}
              </div>
            )}

            {review.suggestedNextSteps && (
              <div className="bg-[#FBF4EF] border border-[#EAC7B9] rounded-2xl p-5">
                <div className="text-[13px] font-bold text-[#8A4A33] mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-rounded" style={{ fontSize: 17 }}>trending_up</span>
                  Bước tiếp theo nên làm
                </div>
                <p className="text-[13px] text-[#57534E] leading-relaxed">{review.suggestedNextSteps}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MentorReviewPage() {
  const { state } = useSession();
  const navigate = useNavigate();

  if (!state.sessionId || !state.userId) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#FAFAF8] p-6 text-center">
        <div>
          <p className="text-[#78716C] text-sm mb-4">Không có phiên đang mở để nhận xét.</p>
          <button onClick={() => navigate('/')} className="h-10 px-5 rounded-lg bg-[#D97757] text-white text-sm font-semibold">Về trang chính</button>
        </div>
      </div>
    );
  }

  if (state.myUserRole === 'mentor') {
    return (
      <MentorReviewForm
        sessionId={state.sessionId}
        mentorId={state.userId}
        studentId={state.partnerId}
        studentName={state.partnerName}
        turns={state.turns}
        audioByTurnId={state.remoteAudioByTurnId}
      />
    );
  }

  return <StudentReviewView sessionId={state.sessionId} userId={state.userId} />;
}
