import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  closeMentorSession,
  createIdentity,
  getMentorHostedSessions,
  getTopics,
  openMentorSession,
  startMentorSession,
} from '../services/api';
import { getIdentity, isMentor, saveIdentity } from '../utils/identity';
import { useSocket } from '../hooks/useSocket';
import { useSession } from '../context/SessionContext';

const FOCUS_OPTIONS = [
  { value: 'part1', label: 'Part 1', estimate: '4–5 phút', desc: 'Hỏi đáp giới thiệu' },
  { value: 'part2', label: 'Part 2', estimate: '3–4 phút', desc: 'Cue card nói dài' },
  { value: 'part3', label: 'Part 3', estimate: '4–5 phút', desc: 'Thảo luận sâu' },
  { value: 'full', label: 'Full test', estimate: '11–14 phút', desc: 'Cả 3 phần' },
];

const POLL_INTERVAL_MS = 5000;

function focusLabel(focus) {
  const found = FOCUS_OPTIONS.find((item) => item.value === focus);
  return found ? found.label : focus;
}

function focusEstimate(focus) {
  const found = FOCUS_OPTIONS.find((item) => item.value === focus);
  return found ? found.estimate : null;
}

function topicHasFocusQuestions(topic, focus) {
  if (!topic) return false;
  if (focus === 'part1') return (topic.partCounts?.part1 ?? 0) > 0;
  if (focus === 'part2') return (topic.partCounts?.part2 ?? 0) > 0;
  if (focus === 'part3') return (topic.partCounts?.part3 ?? 0) > 0;

  return (
    (topic.partCounts?.part1 ?? 0) > 0 &&
    (topic.partCounts?.part2 ?? 0) > 0 &&
    (topic.partCounts?.part3 ?? 0) > 0
  );
}

function formatWait(appliedAt) {
  if (!appliedAt) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(appliedAt).getTime()) / 60000));
  return minutes === 0 ? 'vừa xong' : `chờ ${minutes} phút`;
}

// --- Account creation with a role step (teacher / student) ---
// Shown only when there is no usable account on this device. Choosing "Giáo viên"
// lands on session management; choosing "Học viên" goes to the learner page.
function AccountSignIn({ onSignedIn }) {
  const navigate = useNavigate();
  const [role, setRole] = useState('mentor');
  const [displayName, setDisplayName] = useState('');
  const [band, setBand] = useState(role === 'mentor' ? 8 : 6);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function pickRole(next) {
    setRole(next);
    setBand(next === 'mentor' ? 8 : 6);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!displayName.trim()) {
      setError('Vui lòng nhập tên hiển thị');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { user } = await createIdentity({
        displayName: displayName.trim(),
        band: Number(band),
        userRole: role,
      });
      saveIdentity({
        userId: user.id,
        userRole: role,
        displayName: user.displayName,
        band: user.band,
      });
      if (role === 'student') {
        navigate('/mentor');
      } else {
        onSignedIn();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const roles = [
    { value: 'mentor', label: 'Giáo viên', icon: 'co_present', desc: 'Mở phiên, chọn học viên' },
    { value: 'student', label: 'Học viên', icon: 'school', desc: 'Apply vào phiên mentor' },
  ];

  return (
    <div className="relative min-h-screen grid place-items-center bg-[#FAFAF8] p-6">
      <Link to="/" className="absolute top-6 left-6 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-[#EAE7E3] bg-white text-[13.5px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] hover:bg-[#FBF4EF] transition-colors">
        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_back</span>
        Về trang chính
      </Link>
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-6">
        <h1 className="text-lg font-bold tracking-tight text-[#1C1917]">Tạo tài khoản</h1>
        <p className="text-sm text-[#78716C] mt-1">Chọn vai trò và nhập thông tin để bắt đầu.</p>

        <label className="block text-xs font-semibold text-[#57534E] mt-5 mb-2">Bạn là</label>
        <div className="grid grid-cols-2 gap-2">
          {roles.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => pickRole(r.value)}
              className={`text-left p-3 rounded-xl border transition-colors ${role === r.value ? 'border-[#D97757] bg-[#F7ECE6]' : 'border-[#EAE7E3] hover:bg-[#F1EEEA]'}`}
            >
              <span className={`material-symbols-rounded ${role === r.value ? 'text-[#D97757]' : 'text-[#78716C]'}`} style={{ fontSize: 22 }}>{r.icon}</span>
              <div className={`text-[13.5px] font-bold mt-1 ${role === r.value ? 'text-[#8A4A33]' : 'text-[#1C1917]'}`}>{r.label}</div>
              <div className="text-[11px] text-[#A8A29E] mt-0.5">{r.desc}</div>
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold text-[#57534E] mt-4 mb-1.5">Tên hiển thị</label>
        <input
          value={displayName}
          onChange={(e) => { setDisplayName(e.target.value); setError(''); }}
          placeholder={role === 'mentor' ? 'Ví dụ: Cô Minh Anh' : 'Ví dụ: Nguyễn Lê Huy'}
          maxLength={100}
          autoFocus
          className="w-full h-11 px-3 rounded-lg border border-[#EAE7E3] text-sm focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]"
        />

        <div className="flex items-center justify-between mt-4 mb-1.5">
          <label className="text-xs font-semibold text-[#57534E]">Band của bạn</label>
          <span className="text-sm font-bold text-[#D97757] tabular-nums">{Number(band).toFixed(1)}</span>
        </div>
        <input type="range" min="0" max="9" step="0.5" value={band} onChange={(e) => setBand(Number(e.target.value))} className="w-full accent-[#D97757]" />

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-11 mt-5 rounded-xl text-white font-semibold text-sm bg-[#D97757] hover:brightness-105 disabled:opacity-60"
        >
          {submitting ? 'Đang tạo...' : role === 'mentor' ? 'Tạo & vào quản lý phiên' : 'Tạo & xem phiên mentor'}
        </button>
      </form>
    </div>
  );
}

// --- Create-session modal ---
function OpenSessionModal({ topics, onClose, onCreate, submitting }) {
  const [focus, setFocus] = useState('part2');
  const [bandMin, setBandMin] = useState('6.0');
  const [bandMax, setBandMax] = useState('7.5');
  const [topicId, setTopicId] = useState('');
  const [formError, setFormError] = useState('');

  // A topic is only usable if it has at least one question.
  const usableTopics = topics.filter((t) => (t.questionCount ?? 0) > 0);
  const selectedTopic = usableTopics.find((topic) => topic.id === topicId) || null;
  const selectedTopicMatchesFocus = topicHasFocusQuestions(selectedTopic, focus);

  function handleCreate() {
    if (!topicId) {
      setFormError('Vui lòng chọn bộ câu hỏi cho phiên học');
      return;
    }
    if (!selectedTopicMatchesFocus) {
      setFormError('Bộ câu hỏi này chưa có đủ câu phù hợp với phần luyện đã chọn');
      return;
    }
    onCreate({ focus, targetBandMin: Number(bandMin), targetBandMax: Number(bandMax), topicId });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md bg-white border border-[#EAE7E3] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1EEEA]">
          <h3 className="font-bold text-[#1C1917]">Mở phiên học mới</h3>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg border border-[#EAE7E3] text-[#78716C] hover:bg-[#F1EEEA]">✕</button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#57534E] mb-2">Phần tập trung</label>
            <div className="grid grid-cols-2 gap-1.5">
              {FOCUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFocus(opt.value)}
                  className={`h-auto py-2 px-3 rounded-lg border text-left ${focus === opt.value ? 'border-[#D97757] bg-[#F7ECE6]' : 'border-[#EAE7E3] hover:bg-[#F1EEEA]'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[13.5px] font-bold ${focus === opt.value ? 'text-[#8A4A33]' : 'text-[#1C1917]'}`}>{opt.label}</span>
                    <span className="text-[11px] font-semibold text-[#78716C] inline-flex items-center gap-0.5">
                      <span className="material-symbols-rounded" style={{ fontSize: 13 }}>schedule</span>
                      {opt.estimate}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#A8A29E] mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#57534E] mb-1.5">Band tối thiểu</label>
              <input type="number" min="0" max="9" step="0.5" value={bandMin} onChange={(e) => setBandMin(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#EAE7E3] text-sm focus:outline-none focus:border-[#D97757]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#57534E] mb-1.5">Band tối đa</label>
              <input type="number" min="0" max="9" step="0.5" value={bandMax} onChange={(e) => setBandMax(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#EAE7E3] text-sm focus:outline-none focus:border-[#D97757]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#57534E] mb-1.5">
              Bộ câu hỏi <span className="text-[#D97757]">*</span>
              <span className="text-[#A8A29E] font-normal"> (học viên không thấy)</span>
            </label>
            {usableTopics.length === 0 ? (
              <div className="text-[13px] text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9] rounded-lg px-3 py-2.5">
                Bạn chưa có bộ câu hỏi nào. Hãy vào <b>Bộ câu hỏi</b> để tạo bộ của mình trước khi mở phiên.
              </div>
            ) : (
              <select value={topicId} onChange={(e) => { setTopicId(e.target.value); setFormError(''); }}
                className="w-full h-10 px-3 rounded-lg border border-[#EAE7E3] text-sm focus:outline-none focus:border-[#D97757]">
                <option value="">— Chọn bộ câu hỏi —</option>
                {usableTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.questionCount} câu{t.ownerId === null ? ' · mẫu chung' : ''})
                  </option>
                ))}
              </select>
            )}
            {selectedTopic && !selectedTopicMatchesFocus && (
              <p className="text-[12.5px] text-red-600 mt-2">
                Bộ câu hỏi đã chọn chưa có câu phù hợp với {focusLabel(focus)}.
              </p>
            )}
          </div>
          {formError && <p className="text-[13px] text-red-600">{formError}</p>}
        </div>
        <div className="px-5 py-4 border-t border-[#F1EEEA] flex justify-end gap-2">
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-[#EAE7E3] text-sm font-semibold text-[#57534E] hover:bg-[#F1EEEA]">Hủy</button>
          <button
            disabled={submitting || usableTopics.length === 0 || Boolean(topicId && !selectedTopicMatchesFocus)}
            onClick={handleCreate}
            className="h-10 px-4 rounded-lg bg-[#059669] text-white text-sm font-semibold hover:brightness-105 disabled:opacity-60"
          >
            {submitting ? 'Đang mở...' : 'Mở phiên & nhận đăng ký'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MentorHostPage() {
  const [identity, setIdentity] = useState(() => getIdentity());
  const [sessions, setSessions] = useState([]);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [error, setError] = useState('');
  const [topics, setTopics] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [startingKey, setStartingKey] = useState(null);

  const mentorReady = identity && isMentor();
  const mentorId = identity?.userId;

  const navigate = useNavigate();
  const { joinMentorRoom } = useSocket();
  const { state } = useSession();

  useEffect(() => {
    if (state.phase === 'matched') {
      navigate('/device-check');
    }
  }, [state.phase, navigate]);

  useEffect(() => {
    if (state.error?.type === 'match_error') {
      setError(state.error.message);
    }
  }, [state.error]);

  const loadSessions = useCallback(async () => {
    if (!mentorId) return;
    try {
      const data = await getMentorHostedSessions(mentorId);
      setSessions(data.mentorSessions || []);
      setLoadStatus('loaded');
      setError('');
    } catch (err) {
      setError(err.message);
      setLoadStatus('error');
    }
  }, [mentorId]);

  useEffect(() => {
    if (!mentorReady) return undefined;
    loadSessions();
    const timer = setInterval(loadSessions, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [mentorReady, loadSessions]);

  useEffect(() => {
    if (!mentorReady || !mentorId) return;
    getTopics(mentorId).then((data) => setTopics(data.topics || [])).catch(() => {});
  }, [mentorReady, mentorId]);

  async function handleCreate(payload) {
    setCreating(true);
    setError('');
    try {
      await openMentorSession({ mentorId, ...payload });
      setModalOpen(false);
      await loadSessions();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handlePick(mentorSessionId, studentId) {
    setStartingKey(`${mentorSessionId}:${studentId}`);
    setError('');
    try {
      const result = await startMentorSession({ mentorSessionId, mentorId, studentId });
      // Enter the realtime room; the chosen student joins from their side.
      if (result?.sessionId) {
        joinMentorRoom(result.sessionId, mentorId);
      }
      await loadSessions();
    } catch (err) {
      setError(err.message);
    } finally {
      setStartingKey(null);
    }
  }

  async function handleClose(mentorSessionId) {
    try {
      await closeMentorSession({ mentorSessionId, mentorId });
      await loadSessions();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleEnterStartedSession(session) {
    if (session?.sessionId && mentorId) {
      joinMentorRoom(session.sessionId, mentorId);
    }
  }

  if (!mentorReady) {
    // A student account already exists → send them to the learner page rather
    // than making them create a second account.
    if (identity && !isMentor()) {
      return <Navigate to="/mentor" replace />;
    }
    return <AccountSignIn onSignedIn={() => setIdentity(getIdentity())} />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-3xl mx-auto px-6 py-7">
        <Link to="/" className="inline-flex items-center gap-1.5 h-10 px-4 mb-5 rounded-xl border border-[#EAE7E3] bg-white text-[13.5px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] hover:bg-[#FBF4EF] transition-colors">
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_back</span>
          Về trang chính
        </Link>
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Giảng dạy</div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1C1917] mt-1">Phiên học của tôi</h1>
            <p className="text-sm text-[#78716C] mt-1">Xin chào {identity.displayName}. Mở phiên, xem hàng chờ và chọn học viên để bắt đầu.</p>
          </div>
          <button onClick={() => setModalOpen(true)} className="h-10 px-4 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105 whitespace-nowrap">+ Mở phiên mới</button>
        </div>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

        {loadStatus === 'loaded' && sessions.length === 0 && (
          <div className="text-center py-16 text-[#78716C]">
            <p className="font-semibold text-[#1C1917]">Chưa có phiên nào đang mở</p>
            <p className="text-sm mt-1">Bấm “Mở phiên mới” để bắt đầu nhận học viên vào hàng chờ.</p>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {sessions.map((session) => {
            const waiting = (session.applicants || []).filter((a) => a.status === 'waiting');
            const started = session.status === 'started';
            const chosen = (session.applicants || []).find((a) => a.status === 'chosen');
            return (
              <section key={session.id} className={`bg-white border rounded-2xl overflow-hidden shadow-sm ${started ? 'border-[#EAE7E3]' : 'border-[#A7F3D0]'}`}>
                <div className="px-5 py-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-bold tracking-tight text-[#1C1917]">Phiên luyện Speaking</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-md text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9]">{focusLabel(session.focus)}</span>
                      {focusEstimate(session.focus) && (
                        <span className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-md text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] inline-flex items-center gap-1">
                          <span className="material-symbols-rounded" style={{ fontSize: 13 }}>schedule</span>
                          {focusEstimate(session.focus)}
                        </span>
                      )}
                      {(session.targetBandMin != null || session.targetBandMax != null) && (
                        <span className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-md text-[#57534E] bg-[#FAFAF8] border border-[#EAE7E3]">
                          Band {session.targetBandMin ?? '?'}–{session.targetBandMax ?? '?'}
                        </span>
                      )}
                    </div>
                  </div>
                  {started ? (
                    <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full text-white bg-[#1C1917]">● Đã bắt đầu</span>
                  ) : (
                    <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0]">● Đang nhận đăng ký</span>
                  )}
                </div>

                {started ? (
                  <div className="px-5 py-4 bg-[#ECFDF5] border-t border-[#A7F3D0] text-sm text-[#065F46] flex items-center justify-between gap-3">
                    <span>
                      Đã chọn <b>{chosen?.displayName || 'học viên'}</b> — các học viên còn lại đã được thông báo.
                    </span>
                    {session.sessionId && (
                      <button
                        type="button"
                        onClick={() => handleEnterStartedSession(session)}
                        className="h-10 px-4 rounded-lg bg-[#D97757] text-white text-[13.5px] font-semibold hover:brightness-105 whitespace-nowrap"
                      >
                        Vào phiên học
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-5 py-3 bg-[#FAFAF8] border-y border-[#EAE7E3]">
                      <b className="text-[12.5px]">Hàng chờ học viên</b>
                      <span className="text-xs text-[#78716C]"><b className="text-[#1C1917]">{waiting.length}</b> người · xếp theo thứ tự đăng ký</span>
                    </div>
                    {waiting.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-[#78716C]">Chưa có học viên nào apply.</div>
                    ) : (
                      waiting.map((a, index) => {
                        const key = `${session.id}:${a.studentId}`;
                        return (
                          <div key={a.studentId} className="flex items-center gap-3 px-5 py-3 border-b border-[#F1EEEA] last:border-b-0">
                            <span className="w-5 text-xs font-bold text-[#A8A29E] text-center tabular-nums">{index + 1}</span>
                            <div className="w-10 h-10 rounded-xl grid place-items-center text-white font-bold text-sm bg-[#D97757] shrink-0">
                              {(a.displayName || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-[#1C1917]">{a.displayName}</div>
                              <div className="text-xs text-[#78716C]">
                                {a.band != null && <span className="text-[#D97757] font-bold">Band {a.band}</span>}
                                {a.band != null && ' · '}{formatWait(a.appliedAt)}
                              </div>
                            </div>
                            <button
                              onClick={() => handlePick(session.id, a.studentId)}
                              disabled={startingKey === key}
                              className={`h-10 px-4 rounded-lg text-[13.5px] font-semibold whitespace-nowrap ${index === 0 ? 'bg-[#D97757] text-white' : 'border border-[#EAE7E3] text-[#57534E] hover:bg-[#D97757] hover:text-white hover:border-[#D97757]'} disabled:opacity-60`}
                            >
                              {startingKey === key ? 'Đang vào...' : '▶ Chọn & bắt đầu'}
                            </button>
                          </div>
                        );
                      })
                    )}
                    <div className="px-5 py-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-[#A8A29E]">Chọn một học viên để vào phiên. Những người còn lại sẽ được thông báo.</span>
                      <button onClick={() => handleClose(session.id)} className="h-10 px-4 rounded-lg border border-[#EAE7E3] text-[13.5px] font-semibold text-[#57534E] hover:border-red-300 hover:text-red-600 hover:bg-red-50">Đóng phiên</button>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>

      </div>

      {modalOpen && (
        <OpenSessionModal topics={topics} submitting={creating} onClose={() => setModalOpen(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}
