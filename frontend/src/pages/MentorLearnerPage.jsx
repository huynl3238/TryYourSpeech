import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  applyToMentorSession,
  createIdentity,
  getMentorSessions,
  leaveMentorSession,
} from '../services/api';
import { getIdentity, saveIdentity } from '../utils/identity';
import { useSocket } from '../hooks/useSocket';
import { useSession } from '../context/SessionContext';

const POLL_INTERVAL_MS = 5000;

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

const FOCUS_ESTIMATE = { part1: '4–5 phút', part2: '3–4 phút', part3: '4–5 phút', full: '11–14 phút' };

// --- Student sign-in (only when there is no identity on this device) ---
function StudentSignIn({ onSignedIn, embedded }) {
  const [displayName, setDisplayName] = useState('');
  const [band, setBand] = useState(6);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
        userRole: 'student',
      });
      saveIdentity({
        userId: user.id,
        userRole: 'student',
        displayName: user.displayName,
        band: user.band,
      });
      onSignedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const form = (
    <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-6">
      <h1 className="text-lg font-bold tracking-tight text-[#1C1917]">Vào với tư cách Học viên</h1>
      <p className="text-sm text-[#78716C] mt-1">Tạo danh tính để apply vào phiên học của mentor.</p>

      <label className="block text-xs font-semibold text-[#57534E] mt-5 mb-1.5">Tên hiển thị</label>
      <input
        value={displayName}
        onChange={(e) => { setDisplayName(e.target.value); setError(''); }}
        placeholder="Ví dụ: Nguyễn Lê Huy"
        maxLength={100}
        autoFocus
        className="w-full h-10 px-3 rounded-lg border border-[#EAE7E3] text-sm focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]"
      />

      <div className="flex items-center justify-between mt-4 mb-1.5">
        <label className="text-xs font-semibold text-[#57534E]">Band của bạn</label>
        <span className="text-sm font-bold text-[#D97757] tabular-nums">{Number(band).toFixed(1)}</span>
      </div>
      <input type="range" min="0" max="9" step="0.5" value={band} onChange={(e) => setBand(Number(e.target.value))} className="w-full accent-[#D97757]" />

      {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

      <button type="submit" disabled={submitting} className="w-full h-11 mt-5 rounded-xl text-white font-semibold text-sm bg-[#D97757] hover:brightness-105 disabled:opacity-60">
        {submitting ? 'Đang tạo...' : 'Tiếp tục'}
      </button>
    </form>
  );

  if (embedded) {
    return <div className="grid place-items-center py-10">{form}</div>;
  }

  return (
    <div className="relative min-h-screen grid place-items-center bg-[#FAFAF8] p-6">
      <Link to="/" className="absolute top-6 left-6 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-[#EAE7E3] bg-white text-[13.5px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] hover:bg-[#FBF4EF] transition-colors">
        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_back</span>
        Về trang chính
      </Link>
      {form}
    </div>
  );
}

function SessionCard({ session, busy, onApply, onLeave, onEnter }) {
  const open = session.status === 'open';
  const chosenIsMe = session.chosenIsMe;
  const applied = session.hasApplied;

  let statusBadge;
  if (chosenIsMe) {
    statusBadge = <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full text-white bg-[#059669]">● Bạn được chọn</span>;
  } else if (session.status === 'started') {
    statusBadge = <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full text-[#78716C] bg-[#F1EEEA] border border-[#EAE7E3]">● Đã bắt đầu</span>;
  } else if (applied) {
    statusBadge = <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE]">● Đang trong hàng chờ</span>;
  } else {
    statusBadge = <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0]">● Đang nhận đăng ký</span>;
  }

  let action;
  if (chosenIsMe) {
    action = (
      <div className="flex flex-col items-end gap-1.5">
        <div className="text-sm font-semibold text-[#059669]">Mentor đã chọn bạn 🎉</div>
        <button onClick={() => onEnter(session)} className="h-11 px-5 rounded-lg bg-[#D97757] text-white text-[14px] font-semibold hover:brightness-105 inline-flex items-center gap-1.5 shadow-[0_4px_12px_-2px_rgba(217,119,87,.5)]">
          <span className="material-symbols-rounded icon-fill" style={{ fontSize: 18 }}>play_arrow</span>
          Vào phiên học
        </button>
      </div>
    );
  } else if (session.status === 'started') {
    action = <div className="text-xs text-[#78716C]">Mentor đã chọn học viên khác</div>;
  } else if (applied) {
    action = (
      <button onClick={() => onLeave(session.id)} disabled={busy} className="h-10 px-4 rounded-lg border border-[#EAE7E3] text-[13.5px] font-semibold text-[#57534E] hover:border-red-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-60">
        ✕ Rời hàng chờ
      </button>
    );
  } else {
    action = (
      <button onClick={() => onApply(session.id)} disabled={busy || !open} className="h-11 px-5 rounded-lg bg-[#D97757] text-white text-[14px] font-semibold hover:brightness-105 disabled:opacity-60 whitespace-nowrap inline-flex items-center gap-1.5 shadow-[0_4px_12px_-2px_rgba(217,119,87,.5)]">
        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
        Apply vào hàng chờ
      </button>
    );
  }

  return (
    <article className={`bg-white border rounded-2xl shadow-sm p-4 grid grid-cols-[auto_1fr_auto] gap-4 items-center ${chosenIsMe ? 'border-[#A7F3D0]' : 'border-[#EAE7E3]'}`}>
      <div className="w-12 h-12 rounded-xl grid place-items-center text-white font-bold text-lg bg-[#0D9488] shrink-0">
        {initials(session.mentorName)}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-[#78716C]">
          <b className="text-[#1C1917] font-semibold">{session.mentorName}</b>
          {session.mentorBand != null && <> · Band {session.mentorBand}</>}
        </div>
        <div className="text-[15px] font-bold tracking-tight text-[#1C1917] mt-0.5">Phiên luyện Speaking</div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-md text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9]">{session.focusLabel}</span>
          {FOCUS_ESTIMATE[session.focus] && (
            <span className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-md text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] inline-flex items-center gap-1">
              <span className="material-symbols-rounded" style={{ fontSize: 13 }}>schedule</span>
              {FOCUS_ESTIMATE[session.focus]}
            </span>
          )}
          {(session.targetBandMin != null || session.targetBandMax != null) && (
            <span className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-md text-[#57534E] bg-[#FAFAF8] border border-[#EAE7E3]">
              Mục tiêu Band {session.targetBandMin ?? '?'}–{session.targetBandMax ?? '?'}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 text-right">
        {statusBadge}
        {!chosenIsMe && open && (
          <span className="text-[11.5px] text-[#78716C]"><b className="text-[#1C1917] tabular-nums">{session.applicantCount ?? 0}</b> người trong hàng chờ</span>
        )}
        {action}
      </div>
    </article>
  );
}

export default function MentorLearnerPage({ embedded = false }) {
  const [identity, setIdentity] = useState(() => getIdentity());
  const [sessions, setSessions] = useState([]);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const studentId = identity?.userId;

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

  function handleEnter(session) {
    if (session?.sessionId && studentId) {
      joinMentorRoom(session.sessionId, studentId);
    }
  }

  const loadSessions = useCallback(async () => {
    if (!studentId) return;
    try {
      const data = await getMentorSessions(studentId);
      setSessions(data.mentorSessions || []);
      setLoadStatus('loaded');
      setError('');
    } catch (err) {
      setError(err.message);
      setLoadStatus('error');
    }
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return undefined;
    loadSessions();
    const timer = setInterval(loadSessions, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [studentId, loadSessions]);

  async function handleApply(mentorSessionId) {
    setBusyId(mentorSessionId);
    setError('');
    try {
      await applyToMentorSession({ mentorSessionId, studentId });
      await loadSessions();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleLeave(mentorSessionId) {
    setBusyId(mentorSessionId);
    setError('');
    try {
      await leaveMentorSession({ mentorSessionId, studentId });
      await loadSessions();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!identity) {
    return <StudentSignIn embedded={embedded} onSignedIn={() => setIdentity(getIdentity())} />;
  }

  const heading = (
    <div className="mb-6">
      <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Luyện nói</div>
      <h1 className="text-2xl font-extrabold tracking-tight text-[#1C1917] mt-1">Phiên học với Mentor</h1>
      <p className="text-sm text-[#78716C] mt-1">Mentor mở phiên và tự chọn học viên để bắt đầu. Bấm Apply để vào hàng chờ.</p>
    </div>
  );

  const body = (
    <>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {loadStatus === 'loaded' && sessions.length === 0 && (
        <div className="text-center py-16 text-[#78716C]">
          <p className="font-semibold text-[#1C1917]">Chưa có phiên mentor nào đang mở</p>
          <p className="text-sm mt-1">Khi mentor mở phiên, phiên sẽ xuất hiện tại đây để bạn apply.</p>
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            busy={busyId === session.id}
            onApply={handleApply}
            onLeave={handleLeave}
            onEnter={handleEnter}
          />
        ))}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="max-w-3xl mx-auto">
        {heading}
        {body}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-3xl mx-auto px-6 py-7">
        <Link to="/" className="inline-flex items-center gap-1.5 h-10 px-4 mb-5 rounded-xl border border-[#EAE7E3] bg-white text-[13.5px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] hover:bg-[#FBF4EF] transition-colors">
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_back</span>
          Về trang chính
        </Link>
        {heading}
        {body}
      </div>
    </div>
  );
}
