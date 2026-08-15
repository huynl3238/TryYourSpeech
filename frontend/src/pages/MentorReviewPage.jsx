import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { getResults, submitMentorReview, submitPeerNotes, uploadAudio, getBackendFileUrl } from '../services/api';

const CRITERIA_FIELDS = [
  { key: 'pronunciationComment', label: 'Phát âm', placeholder: 'Nhận xét về phát âm, trọng âm, ngữ điệu…' },
  { key: 'grammarComment', label: 'Ngữ pháp', placeholder: 'Cấu trúc câu, độ chính xác, thì…' },
  { key: 'vocabularyComment', label: 'Từ vựng', placeholder: 'Vốn từ, collocation, độ tự nhiên…' },
  { key: 'fluencyComment', label: 'Trôi chảy', placeholder: 'Tốc độ, mạch lạc, nối ý…' },
];

// Same audio-upload switch as the peer review flow. Mentor sessions never run
// the AI pipeline, but the student's audio is still uploaded here so the student
// can replay it (with the mentor's marks) later on the results screen.
const AI_AUDIO_UPLOAD_ENABLED = import.meta.env.VITE_AI_AUDIO_UPLOAD_ENABLED !== 'false';

const ERROR_TYPE_LABELS = {
  grammar_error: 'Lỗi ngữ pháp',
  collocation_issue: 'Kết hợp từ',
  pause_filler: 'Ngập ngừng',
  false_start: 'Nói lại',
  pronunciation_issue: 'Lỗi phát âm',
  advanced_vocab: 'Từ vựng hay',
  good_connector: 'Nối ý tốt',
  idea_development: 'Ý phát triển tốt',
  pronunciation: 'Phát âm',
  grammar: 'Ngữ pháp',
  vocabulary: 'Từ vựng',
  fluency: 'Trôi chảy',
};

const POSITIVE_TYPES = new Set(['advanced_vocab', 'good_connector', 'idea_development']);

function errorTypeLabel(type) {
  return ERROR_TYPE_LABELS[type] || type;
}

function markerBadgeClass(type) {
  return POSITIVE_TYPES.has(type)
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-[#F7ECE6] text-[#8A4A33] border border-[#EAC7B9]';
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatTimestamp(ms) {
  return `${(Number(ms) || 0) / 1000}s`.replace('.0s', 's');
}

// --- Mentor: replay each answer, detail the TAB marks, then write feedback ---
function MentorTurnReviewList({ turns, audioByTurnId, peerNotes, noteEdits, onEditNote }) {
  const [audioUrls, setAudioUrls] = useState({});
  const audioRefs = useRef({});

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

  function seekTo(turnId, timestampMs) {
    const el = audioRefs.current[turnId];
    if (el) {
      el.currentTime = (Number(timestampMs) || 0) / 1000;
      el.play().catch(() => {});
    }
  }

  if (!Array.isArray(turns) || turns.length === 0) {
    return null;
  }

  return (
    <section className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-5 mb-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Audio & dấu lỗi</div>
          <h2 className="text-base font-bold text-[#1C1917] mt-1">Xem lại và ghi chú chi tiết</h2>
          <p className="text-[12.5px] text-[#78716C] mt-0.5">Bấm vào một dấu lỗi để tua audio tới đúng thời điểm, rồi ghi chú thêm cho học viên.</p>
        </div>
        <span className="text-xs text-[#78716C] tabular-nums whitespace-nowrap">{turns.length} lượt nói</span>
      </div>

      <div className="flex flex-col gap-3">
        {turns.map((turn) => {
          const audioUrl = audioUrls[turn.id];
          const marks = (peerNotes || [])
            .filter((note) => note.turnId === turn.id)
            .sort((a, b) => a.timestampMs - b.timestampMs);

          return (
            <article key={turn.id} className="rounded-xl border border-[#F1EEEA] bg-[#FAFAF8] p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9]">
                  Part {turn.partNumber}
                </span>
                <span className="text-[11px] text-[#78716C]">Thời lượng {formatDuration(turn.durationMs)}</span>
                <span className="text-[11px] text-[#78716C]">· {marks.length} dấu lỗi</span>
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
                <audio
                  ref={(el) => { audioRefs.current[turn.id] = el; }}
                  controls
                  src={audioUrl}
                  className="w-full mt-3"
                />
              ) : (
                <p className="text-[12.5px] text-[#A8A29E] mt-3">
                  Chưa có audio local cho lượt này. Audio có thể mất nếu tab đã được refresh sau phiên.
                </p>
              )}

              {marks.length > 0 && (
                <div className="mt-3 flex flex-col gap-2.5">
                  {marks.map((mark) => (
                    <div key={mark.clientNoteId} className="rounded-lg border border-[#EAE7E3] bg-white p-2.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <button
                          type="button"
                          onClick={() => seekTo(turn.id, mark.timestampMs)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#57534E] hover:text-[#8A4A33]"
                          title="Tua audio tới đây"
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: 15 }}>play_circle</span>
                          {formatTimestamp(mark.timestampMs)}
                        </button>
                        <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded ${markerBadgeClass(mark.errorType)}`}>
                          {errorTypeLabel(mark.errorType)}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={noteEdits[mark.clientNoteId] !== undefined ? noteEdits[mark.clientNoteId] : (mark.noteText || '')}
                        onChange={(e) => onEditNote(mark.clientNoteId, e.target.value)}
                        placeholder="Ghi chú chi tiết cho dấu này (tùy chọn)…"
                        className="w-full rounded-md border border-[#EAE7E3] px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]"
                      />
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// --- Mentor writes the review (marks detail + structured feedback) ---
function MentorReviewForm({ sessionId, mentorId, studentId, studentName, turns, audioByTurnId }) {
  const { state, dispatch } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    overallComment: '',
    pronunciationComment: '',
    grammarComment: '',
    vocabularyComment: '',
    fluencyComment: '',
    suggestedNextSteps: '',
  });
  const [noteEdits, setNoteEdits] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleEditNote(clientNoteId, text) {
    setNoteEdits((prev) => ({ ...prev, [clientNoteId]: text }));
    dispatch({ type: 'UPDATE_PEER_NOTE', payload: { clientNoteId, noteText: text } });
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
      // Save the quick TAB marks (with any detail the mentor added) FIRST — the
      // backend only accepts peer notes while the session is still active/reviewing,
      // and submitMentorReview below flips it to 'completed'.
      const notes = state.peerNotes.map((note) => ({
        ...note,
        noteText: noteEdits[note.clientNoteId] !== undefined ? noteEdits[note.clientNoteId] : note.noteText,
      }));
      if (notes.length > 0) {
        await submitPeerNotes({ sessionId, listenerId: mentorId, notes });
      }

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
          <p className="text-sm text-[#78716C] mt-1.5">{studentName || 'Học viên'} đã nhận được thông báo và có thể xem nhận xét cùng các dấu lỗi của bạn.</p>
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
          <p className="text-sm text-[#78716C] mt-1">Ghi chú chi tiết cho các dấu lỗi đã đánh trong phiên, rồi viết nhận xét tổng quan.</p>
        </div>

        <MentorTurnReviewList
          turns={turns}
          audioByTurnId={audioByTurnId}
          peerNotes={state.peerNotes}
          noteEdits={noteEdits}
          onEditNote={handleEditNote}
        />

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

// --- Student reads the mentor review + replays their answers with the marks ---
function StudentReviewView({ sessionId, userId }) {
  const { state, dispatch } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const localUrlsRef = useRef({});
  const uploadInFlightRef = useRef(new Set());

  async function load() {
    setStatus('loading');
    try {
      const result = await getResults(sessionId, userId);
      setData(result || null);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId]);

  // Upload the student's own audio in the background so it persists on the server
  // and can be replayed later (mentor sessions never trigger the AI pipeline).
  useEffect(() => {
    if (!AI_AUDIO_UPLOAD_ENABLED) return;

    const myTurns = (state.turns || []).filter((t) => t.speakerRole === state.role);
    for (const turn of myTurns) {
      const blob = state.localAudioByTurnId[turn.id];
      if (!blob) continue;
      const current = state.uploadStatus[turn.id];
      if (['uploading', 'done'].includes(current)) continue;
      if (uploadInFlightRef.current.has(turn.id)) continue;

      uploadInFlightRef.current.add(turn.id);
      dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'uploading' } });
      uploadAudio({
        audio: blob,
        turnId: turn.id,
        sessionId,
        speakerId: userId,
        questionId: turn.questionId,
        durationMs: turn.durationMs,
      })
        .then(() => dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'done' } }))
        .catch((err) => {
          console.error(`[MentorReview] Upload audio học viên thất bại (turn ${turn.id}):`, err.message);
          dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'error' } });
        })
        .finally(() => uploadInFlightRef.current.delete(turn.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turns, state.role, state.localAudioByTurnId, sessionId, userId]);

  useEffect(() => {
    return () => {
      Object.values(localUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function audioSrcForTurn(turnResult) {
    const blob = state.localAudioByTurnId?.[turnResult.turnId];
    if (blob) {
      if (!localUrlsRef.current[turnResult.turnId]) {
        localUrlsRef.current[turnResult.turnId] = URL.createObjectURL(blob);
      }
      return localUrlsRef.current[turnResult.turnId];
    }
    return turnResult.audioUrl ? getBackendFileUrl(turnResult.audioUrl) : null;
  }

  const review = data?.mentorReview || null;
  const turnResults = data?.turnResults || [];
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
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Nhận xét từ Mentor</div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1C1917] mt-1">Kết quả phiên với mentor</h1>
          </div>
          <button onClick={load} className="h-9 px-3 mt-1 rounded-lg border border-[#EAE7E3] bg-white text-[13px] font-semibold text-[#57534E] hover:bg-[#F1EEEA] inline-flex items-center gap-1.5 shrink-0">
            <span className="material-symbols-rounded" style={{ fontSize: 17 }}>refresh</span>
            Tải lại
          </button>
        </div>

        {status === 'loading' && <div className="text-center py-16 text-sm text-[#78716C]">Đang tải nhận xét…</div>}

        {status !== 'loading' && (
          <div className="flex flex-col gap-4">
            {/* Answers with the mentor's marks */}
            {turnResults.length > 0 && (
              <div className="flex flex-col gap-3">
                {turnResults.map((turn, index) => {
                  const src = audioSrcForTurn(turn);
                  const marks = (turn.peerNotes || []).slice().sort((a, b) => a.timestampMs - b.timestampMs);
                  return (
                    <div key={turn.turnId} className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-4">
                      <div className="text-[11px] uppercase tracking-wide text-[#78716C] font-bold mb-1.5">Lượt {index + 1}</div>
                      <p className="text-[14px] font-semibold text-[#1C1917] leading-relaxed">{turn.questionText}</p>
                      {src ? (
                        <audio controls src={src} className="w-full mt-3" />
                      ) : (
                        <p className="text-[12.5px] text-[#A8A29E] mt-3">Chưa có audio (đang tải lên hoặc đã mất sau khi refresh).</p>
                      )}
                      {marks.length > 0 && (
                        <ul className="mt-3 flex flex-col gap-1.5">
                          {marks.map((mark, i) => (
                            <li key={i} className="flex items-start gap-2 text-[13px]">
                              <span className="tabular-nums text-[#A8A29E] shrink-0 w-10">{formatTimestamp(mark.timestampMs)}</span>
                              <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded shrink-0 ${markerBadgeClass(mark.errorType)}`}>
                                {errorTypeLabel(mark.errorType)}
                              </span>
                              {mark.noteText && <span className="text-[#57534E]">{mark.noteText}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!review && (
              <div className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-[#F7ECE6] text-[#D97757] grid place-items-center mx-auto mb-4">
                  <span className="material-symbols-rounded" style={{ fontSize: 28 }}>hourglass_top</span>
                </div>
                <h2 className="font-bold text-[#1C1917]">Đang chờ mentor nhận xét</h2>
                <p className="text-sm text-[#78716C] mt-1.5">Mentor sẽ gửi nhận xét sau phiên. Khi nhận được thông báo, hãy bấm "Tải lại" để xem.</p>
              </div>
            )}

            {review && (
              <>
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
              </>
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
    const studentTurns = (state.turns || []).filter((t) => t.speakerRole !== state.role);
    return (
      <MentorReviewForm
        sessionId={state.sessionId}
        mentorId={state.userId}
        studentId={state.partnerId}
        studentName={state.partnerName}
        turns={studentTurns}
        audioByTurnId={state.remoteAudioByTurnId}
      />
    );
  }

  return <StudentReviewView sessionId={state.sessionId} userId={state.userId} />;
}
