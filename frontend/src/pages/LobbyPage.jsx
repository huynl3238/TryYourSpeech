import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useSession } from '../context/SessionContext';
import { useAuth } from '../context/AuthContext';
import {
  addClassroomComment,
  approveClassroomPost,
  declineClassroomPost,
  createQuestion,
  createTopic,
  deleteQuestion,
  deleteTopic,
  getClassroomPost,
  getClassroomPosts,
  getPracticeHistory,
  getResults,
  getSession,
  getStudentWork,
  getTopicDetail,
  getTopics,
  getUserProfile,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateQuestion,
  updateTopic,
  updateUserProfile,
  publishClassroomPost,
  toggleClassroomLike,
  toggleClassroomSave,
} from '../services/api';
import { ErrorScreen } from '../components/ui/ErrorScreen';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { cleanupMediaSession } from '../utils/mediaCleanup';
import { getIdentity } from '../utils/identity';
import { startNotificationsRealtime, onNotification } from '../services/notificationsRealtime';
import MentorLearnerPage from './MentorLearnerPage';
import MentorHostPage from './MentorHostPage';

const NAV_ITEMS = [
  { key: 'practice', label: 'Ghép cặp thực hành', icon: 'groups' },
  { key: 'mentorLearner', label: 'Luyện với Mentor', icon: 'cast_for_education' },
  { key: 'mentorHost', label: 'Phiên của Mentor', icon: 'co_present' },
  { key: 'classroom', label: 'Lớp học', icon: 'forum' },
  { key: 'history', label: 'Lịch sử luyện tập', icon: 'history' },
  { key: 'topicBuilder', label: 'Quản lý bộ câu hỏi', icon: 'library_add' },
  { key: 'teacherReviews', label: 'Bài học viên', icon: 'school' },
  { key: 'notifications', label: 'Thông báo', icon: 'notifications' },
];

const ERROR_TYPE_CONFIG = {
  pronunciation: { label: 'Phát âm', badgeClass: 'error-pronunciation', borderColor: '#ef4444' },
  grammar: { label: 'Ngữ pháp', badgeClass: 'error-grammar', borderColor: '#f59e0b' },
  vocabulary: { label: 'Từ vựng', badgeClass: 'error-vocabulary', borderColor: '#10b981' },
  fluency: { label: 'Trôi chảy', badgeClass: 'error-fluency', borderColor: '#7c3aed' },
};

const CLASSROOM_POSTS = [
  {
    id: 1,
    author: {
      name: 'Cô Minh Anh',
      handle: '@minhanh_ielts',
      avatar: 'M',
    },
    time: '2 giờ trước',
    title: 'Một đoạn Part 2 xử lý cue card rất tự nhiên',
    description: 'Học viên dùng ví dụ cá nhân tốt, biết nối ý bằng các cụm như “what stood out to me was...” và “looking back, I think...”. Cùng xem cách bạn ấy xử lý đề Describe a person who inspired you nhé.',
    videoPlaceholder: 'Describe a person who inspired you',
    tags: ['Part 2', 'Storytelling', 'Band 6.5+'],
    participants: [
      { name: 'Minh Anh', role: 'A', band: 6.5, avatar: 'A' },
      { name: 'Huy', role: 'B', band: 6.0, avatar: 'H' },
    ],
    aiTranscripts: [
      {
        speakerName: 'Minh Anh',
        speakerRole: 'A',
        partNumber: 2,
        partLabel: 'Part 2 · Cue Card',
        words: [
          { text: 'The' },
          { text: 'person' },
          { text: 'who' },
          { text: 'really' },
          { text: 'inspired', hasPronunciationError: true, feedback: 'Âm /d/ cuối chưa rõ.' },
          { text: 'me', hasPronunciationError: true, feedback: 'Nối âm với từ trước hơi yếu.' },
          { text: 'is' },
          { text: 'my' },
          { text: 'older' },
          { text: 'sister.' },
          { text: 'What' },
          { text: 'stood' },
          { text: 'out' },
          { text: 'to' },
          { text: 'me' },
          { text: 'was' },
          { text: 'her' },
          { text: 'patience' },
          { text: 'and' },
          { text: 'the' },
          { text: 'way' },
          { text: 'she' },
          { text: 'encouraged' },
          { text: 'me' },
          { text: 'when' },
          { text: 'I' },
          { text: 'felt' },
          { text: 'stuck.', hasPronunciationError: true, feedback: 'Âm /k/ cuối cần bật rõ hơn.' },
        ],
      },
      {
        speakerName: 'Huy',
        speakerRole: 'B',
        partNumber: 1,
        partLabel: 'Part 1 · Câu hỏi ngắn',
        words: [
          { text: 'I' },
          { text: 'usually' },
          { text: 'ask' },
          { text: 'my' },
          { text: 'uncle' },
          { text: 'for' },
          { text: 'advice' },
          { text: 'because' },
          { text: 'he' },
          { text: 'give', hasPronunciationError: true, feedback: 'Vừa sai ngữ pháp, vừa phát âm thiếu âm /z/ trong “gives”.' },
          { text: 'me' },
          { text: 'many' },
          { text: 'useful' },
          { text: 'suggestions.' },
        ],
      },
    ],
    peerReviews: [
      {
        reviewerName: 'Huy',
        reviewerRole: 'B',
        targetName: 'Minh Anh',
        notes: [
          {
            partNumber: 2,
            partLabel: 'Part 2 · Cue Card',
            questionText: 'Describe a person who inspired you',
            timestampMs: 18000,
            errorType: 'pronunciation',
            noteText: 'Âm cuối trong cụm “inspired me” hơi nhẹ, cần bật rõ hơn để câu nghe chắc.',
          },
          {
            partNumber: 2,
            partLabel: 'Part 2 · Cue Card',
            questionText: 'Describe a person who inspired you',
            timestampMs: 52000,
            errorType: 'fluency',
            noteText: 'Có đoạn ngập ngừng trước khi chuyển sang ví dụ cá nhân, nên dùng một cụm nối ý ngắn để giữ mạch nói.',
          },
        ],
      },
      {
        reviewerName: 'Minh Anh',
        reviewerRole: 'A',
        targetName: 'Huy',
        notes: [
          {
            partNumber: 1,
            partLabel: 'Part 1 · Câu hỏi ngắn',
            questionText: 'Who is someone you often ask for advice?',
            timestampMs: 27000,
            errorType: 'vocabulary',
            noteText: 'Ý tốt nhưng từ “good person” còn chung chung, có thể đổi thành “a supportive mentor”.',
          },
          {
            partNumber: 3,
            partLabel: 'Part 3 · Thảo luận mở rộng',
            questionText: 'Why do young people need role models?',
            timestampMs: 74000,
            errorType: 'grammar',
            noteText: 'Câu “he give me advice” cần sửa thành “he gives me advice”.',
          },
        ],
      },
    ],
    aiComment: 'Fluency & Coherence: Tốt. Thí sinh trả lời trôi chảy, tốc độ nói ổn định. Lexical Resource: Có sử dụng một số từ vựng tốt như "stood out to me". Pronunciation: Rõ ràng, dễ nghe. Overall Band Estimate: 6.5',
    likes: 24,
    commentsCount: 5,
    saves: 12
  },
  {
    id: 2,
    author: {
      name: 'Thầy Quốc Bảo',
      handle: '@quocbao_teacher',
      avatar: 'Q',
    },
    time: '5 giờ trước',
    title: 'Ví dụ hay về cách mở rộng câu trả lời Part 3',
    description: 'Đoạn này tốt ở cách đưa quan điểm, giải thích nguyên nhân rồi thêm một ví dụ cụ thể thay vì chỉ trả lời một câu ngắn. Chủ đề Education and technology.',
    videoPlaceholder: 'Education and technology',
    tags: ['Part 3', 'Coherence', 'Idea development'],
    participants: [
      { name: 'An', role: 'A', band: 7.0, avatar: 'A' },
      { name: 'Trang', role: 'B', band: 6.5, avatar: 'T' },
    ],
    aiTranscripts: [
      {
        speakerName: 'An',
        speakerRole: 'A',
        partNumber: 3,
        partLabel: 'Part 3 · Thảo luận mở rộng',
        words: [
          { text: 'From' },
          { text: 'my' },
          { text: 'perspective,' },
          { text: 'technology' },
          { text: 'has' },
          { text: 'changed' },
          { text: 'education' },
          { text: 'because' },
          { text: 'students' },
          { text: 'can' },
          { text: 'access' },
          { text: 'materials' },
          { text: 'more' },
          { text: 'quickly.' },
          { text: 'However,' },
          { text: 'teachers' },
          { text: 'still' },
          { text: 'play' },
          { text: 'an' },
          { text: 'important' },
          { text: 'role' },
          { text: 'in' },
          { text: 'the' },
          { text: 'classroom.', hasPronunciationError: true, feedback: 'Trọng âm từ chưa rõ, dễ nghe thành “class rum”.' },
        ],
      },
      {
        speakerName: 'Trang',
        speakerRole: 'B',
        partNumber: 2,
        partLabel: 'Part 2 · Cue Card',
        words: [
          { text: 'I' },
          { text: 'would' },
          { text: 'like' },
          { text: 'to' },
          { text: 'describe' },
          { text: 'an' },
          { text: 'online' },
          { text: 'class' },
          { text: 'that' },
          { text: 'helped' },
          { text: 'me' },
          { text: 'improve' },
          { text: 'my' },
          { text: 'speaking.', hasPronunciationError: true, feedback: 'Âm cuối /ŋ/ chưa ổn định.' },
        ],
      },
    ],
    peerReviews: [
      {
        reviewerName: 'Trang',
        reviewerRole: 'B',
        targetName: 'An',
        notes: [
          {
            partNumber: 3,
            partLabel: 'Part 3 · Thảo luận mở rộng',
            questionText: 'How has technology changed education?',
            timestampMs: 15000,
            errorType: 'fluency',
            noteText: 'Mở câu khá tự nhiên với “from my perspective”, tốc độ nói ổn định.',
          },
          {
            partNumber: 3,
            partLabel: 'Part 3 · Thảo luận mở rộng',
            questionText: 'How has technology changed education?',
            timestampMs: 43000,
            errorType: 'grammar',
            noteText: 'Cần chú ý mạo từ trong cụm “technology in classroom”, nên nói “in the classroom”.',
          },
        ],
      },
      {
        reviewerName: 'An',
        reviewerRole: 'A',
        targetName: 'Trang',
        notes: [
          {
            partNumber: 2,
            partLabel: 'Part 2 · Cue Card',
            questionText: 'Describe an online class you found useful',
            timestampMs: 36000,
            errorType: 'vocabulary',
            noteText: 'Có thể thay “many things” bằng “a wide range of learning resources” để cụ thể hơn.',
          },
        ],
      },
    ],
    aiComment: 'Grammar: Cấu trúc câu đa dạng, có sử dụng câu phức. Tuy nhiên cần chú ý mạo từ. Overall: 7.0',
    likes: 45,
    commentsCount: 8,
    saves: 30
  },
];

const PRACTICE_HISTORY = [
  {
    id: 'session-01',
    date: '28/05/2026',
    topic: 'People who inspire you',
    partnerName: 'Huy',
    duration: '21 phút',
    bandEstimate: 6.5,
    status: 'Đã chấm AI',
    publicStatus: 'Chưa public',
    notesCount: 4,
  },
  {
    id: 'session-02',
    date: '24/05/2026',
    topic: 'Education and technology',
    partnerName: 'Trang',
    duration: '19 phút',
    bandEstimate: 6.0,
    status: 'Đã review',
    publicStatus: 'Đang chờ duyệt',
    notesCount: 3,
  },
  {
    id: 'session-03',
    date: '18/05/2026',
    topic: 'Hometown and daily routine',
    partnerName: 'An',
    duration: '18 phút',
    bandEstimate: 5.5,
    status: 'Hoàn tất',
    publicStatus: 'Đã public',
    notesCount: 5,
  },
];

const TEACHER_PRACTICE_REVIEWS = [
  {
    id: 'teacher-session-01',
    date: '29/05/2026',
    students: ['Minh Anh', 'Huy'],
    topic: 'People who inspire you',
    averageBand: 6.5,
    teacherStatus: 'Nên public',
    publicStatus: 'Chưa public',
  },
  {
    id: 'teacher-session-02',
    date: '27/05/2026',
    students: ['An', 'Trang'],
    topic: 'Education and technology',
    averageBand: 6.8,
    teacherStatus: 'Cần xem lại pronunciation',
    publicStatus: 'Đã public',
  },
  {
    id: 'teacher-session-03',
    date: '22/05/2026',
    students: ['Bảo', 'Linh'],
    topic: 'Work and study',
    averageBand: 5.8,
    teacherStatus: 'Chưa public',
    publicStatus: 'Riêng tư',
  },
];

const TOPIC_DRAFTS = [
  {
    part: 'Part 1',
    question: 'Do you prefer studying alone or with other people?',
    hint: 'Trả lời trực tiếp, đưa lý do ngắn và một ví dụ cá nhân.',
  },
  {
    part: 'Part 2',
    question: 'Describe a time when you learned something from another person.',
    hint: 'Chuẩn bị who, what you learned, how it happened, and why it was useful.',
  },
  {
    part: 'Part 3',
    question: 'Why do people learn better when they discuss with others?',
    hint: 'Nêu quan điểm, giải thích nguyên nhân, so sánh tự học và học theo nhóm.',
  },
];

const NOTIFICATIONS = [
  {
    id: 'notice-01',
    type: 'classroom',
    icon: 'forum',
    title: 'Có bài đăng mới trên Lớp học',
    description: 'Cô Minh Anh vừa public một bài Part 2 về chủ đề người truyền cảm hứng.',
    time: '10 phút trước',
    status: 'new',
  },
  {
    id: 'notice-02',
    type: 'approved',
    icon: 'verified',
    title: 'Bài đăng của bạn đã được duyệt',
    description: 'Phiên luyện “Education and technology” đã xuất hiện trong Lớp học.',
    time: '2 giờ trước',
    status: 'success',
  },
  {
    id: 'notice-03',
    type: 'comment',
    icon: 'rate_review',
    title: 'Có nhận xét mới về bài đăng của bạn',
    description: 'Trang đã thêm một ghi chú pronunciation ở Part 3, mốc 0:43.',
    time: 'Hôm qua',
    status: 'default',
  },
];

function profileInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'YS';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Live unread-notification count for the sidebar badge. Seeds from the API,
// then refetches whenever a realtime "notification:new" ping arrives or the
// active tab changes (so reading notifications clears the badge).
function useUnreadNotifications(activeTab) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const userId = getIdentity()?.userId;
    if (!userId) {
      setUnread(0);
      return undefined;
    }

    startNotificationsRealtime();
    let cancelled = false;

    async function refresh() {
      try {
        const data = await getNotifications(userId);
        if (!cancelled) {
          setUnread(data.unreadCount || 0);
        }
      } catch {
        // Best-effort badge; ignore transient fetch errors.
      }
    }

    refresh();
    // The server emits while its DB transaction may still be committing, so a
    // ping can arrive a beat before the row is visible. Refetch now and again
    // shortly after to self-heal that race.
    const off = onNotification(() => {
      refresh();
      setTimeout(refresh, 700);
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [activeTab]);

  return unread;
}

function Sidebar({ activeTab, onChangeTab, open, onClose }) {
  const { state } = useSession();
  const identity = getIdentity() || {};
  const unreadNotifications = useUnreadNotifications(activeTab);

  const displayName = state.displayName || identity.displayName || 'Khách';
  const band = state.band ?? identity.band ?? null;
  const role = (state.myUserRole || identity.userRole) === 'mentor' ? 'Mentor' : 'Học viên IELTS';

  return (
    <aside className={`app-sidebar ${open ? 'app-sidebar-open' : ''}`}>
      <div className="app-brand">
        <div className="app-brand-icon">
          <span className="material-symbols-rounded icon-fill">record_voice_over</span>
        </div>
        <div>
          <h1>Try Your Speech</h1>
          <p>IELTS Speaking Lab</p>
        </div>
        <button
          type="button"
          className="app-sidebar-close"
          onClick={onClose}
          aria-label="Đóng menu"
        >
          <span className="material-symbols-rounded">close</span>
        </button>
      </div>

      <nav className="app-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`app-nav-item ${activeTab === item.key ? 'active' : ''}`}
            onClick={() => onChangeTab(item.key)}
          >
            <span className="material-symbols-rounded">{item.icon}</span>
            {item.label}
            {item.key === 'notifications' && unreadNotifications > 0 && (
              <span
                className="ml-auto min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-[#D97757] text-white text-xs font-semibold"
              >
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </button>
        ))}

      </nav>

      <button
        type="button"
        onClick={() => onChangeTab('profile')}
        className={`group mt-auto w-full flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all ${
          activeTab === 'profile'
            ? 'border-[#EAC7B9] bg-[#FBF4EF] shadow-[0_8px_24px_-8px_rgba(217,119,87,.35)]'
            : 'border-[#EAE7E3] bg-white hover:border-[#EAC7B9] hover:bg-[#FEF9F6]'
        }`}
      >
        <div className="relative shrink-0">
          <div className="w-11 h-11 rounded-xl grid place-items-center text-white font-bold text-[15px] tracking-wide bg-[#D97757] shadow-[0_6px_16px_-4px_rgba(217,119,87,.55)]">
            {profileInitials(displayName)}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#22C55E] border-2 border-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <strong className="block truncate text-[14.5px] font-bold text-[#1C1917] leading-tight">{displayName}</strong>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[11.5px] font-medium text-[#78716C] truncate">{role}</span>
            {band != null && (
              <span className="shrink-0 text-[10.5px] font-bold text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9] px-1.5 py-[1px] rounded-md tabular-nums leading-none">
                Band {Number(band).toFixed(1)}
              </span>
            )}
          </div>
        </div>
        <span className="material-symbols-rounded shrink-0 text-[#A8A29E] group-hover:text-[#D97757] transition-colors" style={{ fontSize: 20 }}>
          {activeTab === 'profile' ? 'expand_less' : 'chevron_right'}
        </span>
      </button>

      <SidebarAccount />
    </aside>
  );
}

// Google account strip under the profile card. During this phase signing in is
// optional (the app still runs on the device identity), so it only surfaces the
// account state and the admin shortcut.
function SidebarAccount() {
  const { isLoading, isAuthenticated, user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="mt-2 px-1 text-[11.5px] text-[#A8A29E]">Đang kiểm tra đăng nhập…</div>;
  }

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="mt-2 w-full flex items-center justify-center gap-1.5 h-10 rounded-xl border border-[#EAE7E3] bg-white text-[13px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] hover:bg-[#FBF4EF] transition-colors"
      >
        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>login</span>
        Đăng nhập bằng Google
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[#EAE7E3] bg-white p-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="material-symbols-rounded text-[#22C55E] shrink-0" style={{ fontSize: 17 }}>verified_user</span>
        <span className="text-[11.5px] text-[#78716C] truncate flex-1">{user?.email || user?.displayName}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        {isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="flex-1 h-8 rounded-lg border border-[#EAE7E3] text-[12px] font-semibold text-[#57534E] hover:bg-[#F1EEEA]"
          >
            Quản trị
          </button>
        )}
        <button
          type="button"
          onClick={() => logout()}
          className="flex-1 h-8 rounded-lg border border-[#EAE7E3] text-[12px] font-semibold text-[#57534E] hover:bg-[#F1EEEA]"
        >
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

function DeviceCheckModal({ onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let audioCtx;
    let rafId;
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus('ready');

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (const value of data) sum += value;
          setLevel(Math.min(1, (sum / data.length) / 45));
          rafId = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    start();

    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);

    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKey);
      if (rafId) cancelAnimationFrame(rafId);
      if (audioCtx) audioCtx.close().catch(() => {});
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, [onClose]);

  const activeBars = Math.round(level * 16);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 backdrop-blur-sm p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[460px] bg-white border border-[#EAE7E3] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-[18px] py-4 border-b border-[#F1EEEA]">
          <h3 className="font-bold text-[15px] text-[#1C1917]">Kiểm tra camera &amp; micro</h3>
          <button onClick={onClose} aria-label="Đóng" className="w-[30px] h-[30px] grid place-items-center rounded-lg border border-[#EAE7E3] text-[#78716C] hover:bg-[#F1EEEA]">✕</button>
        </div>
        <div className="p-[18px] flex flex-col gap-4">
          <div className="relative aspect-[16/10] rounded-xl border border-[#EAE7E3] overflow-hidden bg-[#111]">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
            {status === 'loading' && (
              <div className="absolute inset-0 grid place-items-center text-white/80 text-sm">Đang mở camera…</div>
            )}
            {status === 'error' && (
              <div className="absolute inset-0 grid place-items-center text-center text-white/90 text-sm px-6 bg-[#1C1917]">
                Không truy cập được camera/mic. Hãy cấp quyền trong trình duyệt rồi mở lại.
              </div>
            )}
            {status === 'ready' && (
              <span className="absolute left-3 bottom-3 text-[11px] font-bold text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] px-2.5 py-1 rounded-full">✓ Camera hoạt động</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="w-[38px] h-[38px] rounded-[10px] bg-[#F7ECE6] text-[#D97757] grid place-items-center shrink-0">🎙️</div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <b className="text-[13px] font-semibold text-[#1C1917]">Micro</b>
                <span className="text-[11px] font-bold text-[#059669]">{status === 'ready' ? 'Đang nhận — hãy thử nói' : '…'}</span>
              </div>
              <div className="flex gap-[3px] mt-2 h-2.5 items-end">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span key={i} className="flex-1 rounded-sm h-full" style={{ background: i < activeBars ? (i > 11 ? '#E3A187' : '#059669') : '#EAE7E3' }} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="px-[18px] py-3.5 border-t border-[#F1EEEA] flex justify-end">
          <button onClick={onClose} className="h-10 px-5 rounded-lg bg-[#D97757] text-white text-[13.5px] font-semibold hover:brightness-105">Thiết bị đã ổn</button>
        </div>
      </div>
    </div>
  );
}

function PracticePanel({
  displayName,
  setDisplayName,
  band,
  setBand,
  nameError,
  setNameError,
  isSearching,
  onSubmit,
  onCancel,
}) {
  const [checkOpen, setCheckOpen] = useState(false);

  function stepBand(direction) {
    const next = Math.round((band + direction * 0.5) * 2) / 2;
    if (next < 0 || next > 9) return;
    setBand(next);
  }

  return (
    <div className="flex flex-col items-center justify-center gap-5 min-h-[calc(100vh-130px)]">
      {!isSearching ? (
        <>
          <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[#78716C] bg-white border border-[#EAE7E3] px-3.5 py-1.5 rounded-full shadow-sm">
            <span className="w-[7px] h-[7px] rounded-full bg-[#059669]" />
            Ghép với người học <b className="text-[#1C1917] font-semibold">cùng band ±1.0</b>
          </span>

          {/* Video stage */}
          <div className="relative w-[min(560px,90vw)] aspect-[16/10] max-h-[46vh] rounded-[20px] overflow-hidden border border-[#EAE7E3] shadow-[0_2px_6px_rgba(28,25,23,.05),0_12px_32px_-8px_rgba(28,25,23,.12)]"
            style={{ background: '#F4EFEA' }}>
            <div className="absolute inset-0 grid place-items-center">
              <div className="w-[108px] h-[108px] rounded-full grid place-items-center" style={{ background: '#F7ECE6' }}>
                <span className="material-symbols-rounded text-[#A8A29E]" style={{ fontSize: 56 }}>person</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCheckOpen(true)}
              className="absolute right-3.5 top-3.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#1C1917] bg-white/85 backdrop-blur border border-[#EAE7E3] px-3 py-2 rounded-full shadow-sm hover:bg-white hover:border-[#EAC7B9] hover:text-[#8A4A33]"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>videocam</span>
              Kiểm tra thiết bị
            </button>
            <span className="absolute left-3.5 bottom-3.5 inline-flex items-center gap-2 text-[12px] font-semibold text-[#1C1917] bg-white/80 backdrop-blur border border-[#EAE7E3] px-2.5 py-1.5 rounded-lg">
              <span className="w-[7px] h-[7px] rounded-full bg-[#EF4444]" />
              Bạn
            </span>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col items-center gap-4">
            {/* Name */}
            <div className="w-[min(360px,90vw)]">
              <Input
                id="display-name"
                type="text"
                placeholder="Nhập tên hiển thị của bạn"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setNameError(''); }}
                autoFocus
                maxLength={100}
                className={`text-center ${nameError ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
              />
              {nameError && <p className="text-xs text-red-500 text-center mt-1.5">{nameError}</p>}
            </div>

            {/* Band dial */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.09em] text-[#A8A29E] font-bold">Band của bạn</span>
              <div className="flex items-center gap-[18px]">
                <button type="button" onClick={() => stepBand(-1)} disabled={band <= 0}
                  aria-label="Giảm band"
                  className="w-10 h-10 rounded-full border border-[#EAE7E3] bg-white text-[#57534E] grid place-items-center shadow-sm hover:border-[#EAC7B9] hover:text-[#D97757] disabled:opacity-35">
                  <span className="material-symbols-rounded" style={{ fontSize: 20 }}>chevron_left</span>
                </button>
                <div className="w-[92px] text-center text-[42px] leading-[52px] font-extrabold tracking-[-0.04em] text-[#D97757] tabular-nums">
                  {band.toFixed(1)}
                </div>
                <button type="button" onClick={() => stepBand(1)} disabled={band >= 9}
                  aria-label="Tăng band"
                  className="w-10 h-10 rounded-full border border-[#EAE7E3] bg-white text-[#57534E] grid place-items-center shadow-sm hover:border-[#EAC7B9] hover:text-[#D97757] disabled:opacity-35">
                  <span className="material-symbols-rounded" style={{ fontSize: 20 }}>chevron_right</span>
                </button>
              </div>
            </div>

            {/* Start */}
            <button
              id="find-partner-btn"
              type="submit"
              className="h-[58px] px-11 rounded-full text-white text-[17px] font-bold tracking-[-0.01em] inline-flex items-center gap-2.5 hover:-translate-y-px transition-transform"
              style={{ background: '#D97757', boxShadow: '0 10px 26px -6px rgba(217,119,87,.55), inset 0 1px 0 rgba(255,255,255,.3)' }}
            >
              <span className="material-symbols-rounded icon-fill" style={{ fontSize: 22 }}>play_arrow</span>
              Bắt đầu ghép
            </button>
            <p className="text-[12.5px] text-[#A8A29E]">Nối với người học cùng band · nhấn <b className="text-[#78716C] font-semibold">Esc</b> để dừng khi đang tìm</p>
          </form>
        </>
      ) : (
        <div className="flex flex-col items-center text-center gap-4 min-h-[calc(100vh-130px)] justify-center">
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#F7ECE6]">
            <span className="material-symbols-rounded icon-fill text-[#D97757]" style={{ fontSize: 30 }}>person_search</span>
            <div className="absolute inset-[-6px] rounded-full border-2 border-[#E3A187] border-t-transparent animate-spin-slow" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Đang tìm đối tác…</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Xin chào <span className="font-medium text-zinc-700">{displayName}</span>! Đang tìm người có Band {band.toFixed(1)} ± 1.0
            </p>
          </div>
          <div className="text-xs text-zinc-500 bg-[#F7ECE6] border border-[#EAC7B9] rounded-lg px-4 py-2.5">
            Chuẩn bị sẵn mic và camera trong lúc chờ
          </div>
          <Button variant="outline" onClick={onCancel} size="sm">
            <span className="material-symbols-rounded" style={{ fontSize: 15 }}>close</span>
            Hủy tìm kiếm
          </Button>
        </div>
      )}

      {checkOpen && <DeviceCheckModal onClose={() => setCheckOpen(false)} />}
    </div>
  );
}

function formatTimestamp(timestampMs) {
  const totalSeconds = Math.round(timestampMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function groupNotesByPart(notes) {
  return notes.reduce((groups, note) => {
    const partNumber = note.partNumber || 0;
    const existingGroup = groups.find((group) => group.partNumber === partNumber);
    if (existingGroup) {
      existingGroup.notes.push(note);
      return groups;
    }

    return [
      ...groups,
      {
        partNumber,
        partLabel: note.partLabel || `Part ${partNumber}`,
        notes: [note],
      },
    ].sort((a, b) => a.partNumber - b.partNumber);
  }, []);
}

function ClassroomPostDetail({
  post,
  focusSection,
  commentDraft = '',
  interactionError = '',
  isSubmittingComment = false,
  onBack,
  onChangeCommentDraft = () => {},
  onSubmitComment = () => {},
  onToggleLike = () => {},
  onToggleSave = () => {},
}) {
  const aiCriteria = [
    {
      label: 'Fluency & Coherence',
      score: post.id === 1 ? '6.5' : '7.0',
      text: post.id === 1
        ? 'Bài nói khá trôi chảy, biết nối ý bằng ví dụ cá nhân và các cụm chuyển ý tự nhiên.'
        : 'Câu trả lời có hướng phát triển rõ: nêu quan điểm, giải thích nguyên nhân và thêm ví dụ cụ thể.',
    },
    {
      label: 'Lexical Resource',
      score: '6.5',
      text: post.id === 1
        ? 'Từ vựng không quá phức tạp nhưng dùng đúng ngữ cảnh, có một số cụm tốt như “stood out to me”.'
        : 'Có dùng một số cụm diễn đạt quan điểm tốt, nhưng vẫn có thể mở rộng thêm collocation theo chủ đề.',
    },
    {
      label: 'Grammar Range & Accuracy',
      score: post.id === 1 ? '6.0' : '7.0',
      text: post.id === 1
        ? 'Cấu trúc câu đủ rõ để truyền đạt ý, nên thêm câu phức để tăng độ linh hoạt.'
        : 'Cấu trúc câu đa dạng hơn, có câu phức; cần chú ý thêm mạo từ và độ chính xác khi nói nhanh.',
    },
    {
      label: 'Pronunciation',
      score: '6.5',
      text: 'Phát âm nhìn chung rõ và dễ nghe. Nên tiếp tục luyện trọng âm câu và âm cuối để câu nói tự nhiên hơn.',
    },
  ];

  const focusRing = (name) => focusSection === name ? 'ring-2 ring-[#EAC7B9] border-[#EAC7B9]' : 'border-[#EAE7E3]';

  return (
    <section className="w-full max-w-2xl mx-auto flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-[#EAE7E3] bg-white shadow-sm text-[13.5px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] hover:bg-[#FBF4EF] transition-colors">
        <span className="material-symbols-rounded" style={{ fontSize: 19 }}>arrow_back</span>
        Quay lại lớp học
      </button>

      {/* Hero */}
      <div className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-5">
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">{post.videoPlaceholder}</div>
        <h1 className="text-xl font-extrabold tracking-tight text-[#1C1917] mt-1.5 leading-snug">{post.title}</h1>
        <p className="text-[13.5px] text-[#57534E] leading-relaxed mt-2">{post.description}</p>
        <div className="flex flex-wrap gap-2 mt-4">
          {post.participants.map((participant) => (
            <div key={participant.role} className="flex items-center gap-2.5 bg-[#FAFAF8] border border-[#EAE7E3] rounded-xl px-3 py-2">
              <div className="w-9 h-9 rounded-lg grid place-items-center text-white font-bold text-[13px] bg-[#0D9488]">{participant.avatar}</div>
              <div>
                <div className="text-[13px] font-semibold text-[#1C1917]">{participant.name}</div>
                <div className="text-[11.5px] text-[#78716C]">Vai {participant.role} · Band {participant.band}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Video */}
      <div className="relative aspect-video rounded-2xl overflow-hidden grid place-items-center" style={{ background: '#1C1917' }}>
        <div className="flex flex-col items-center text-white/90">
          <span className="w-14 h-14 rounded-full bg-white/95 grid place-items-center shadow-lg mb-2">
            <span className="material-symbols-rounded icon-fill text-[#D97757]" style={{ fontSize: 26 }}>play_arrow</span>
          </span>
          <strong className="text-sm">{post.videoPlaceholder}</strong>
          <small className="text-white/60">Video bài nói</small>
        </div>
      </div>

      {/* Like / save */}
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onToggleLike(post)} aria-label="Thích"
          className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#F1EEEA] ${post.isLiked ? 'text-[#DC2626]' : 'text-[#78716C]'}`}>
          <span className="material-symbols-rounded" style={{ fontSize: 18, fontVariationSettings: post.isLiked ? "'FILL' 1" : undefined }}>favorite</span>
          <span className="tabular-nums">{post.likes}</span>
        </button>
        <button type="button" onClick={() => onToggleSave(post)} aria-label="Lưu"
          className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#F1EEEA] ${post.isSaved ? 'text-[#D97757]' : 'text-[#78716C]'}`}>
          <span className="material-symbols-rounded" style={{ fontSize: 18, fontVariationSettings: post.isSaved ? "'FILL' 1" : undefined }}>bookmark</span>
          <span className="tabular-nums">{post.saves}</span>
        </button>
      </div>

      {/* AI section */}
      <div className={`bg-white border rounded-2xl shadow-sm p-5 ${focusRing('ai')}`}>
        <div className="flex items-center gap-2 text-[15px] font-bold text-[#1C1917]">
          <span className="material-symbols-rounded icon-fill text-[#D97757]" style={{ fontSize: 19 }}>robot_2</span>
          Nhận xét từ AI
        </div>
        <p className="text-xs text-[#78716C] mt-0.5">Đánh giá chi tiết theo các tiêu chí IELTS Speaking.</p>

        <div className="mt-4 p-3.5 rounded-xl border border-[#EAC7B9]" style={{ background: '#FBF4EF' }}>
          <div className="text-[11px] uppercase tracking-wide text-[#8A4A33] font-bold mb-1">Đánh giá tổng quan</div>
          <p className="text-[13.5px] text-[#1C1917] leading-relaxed">{post.aiComment}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {aiCriteria.map((item) => (
            <div key={item.label} className="border border-[#EAE7E3] rounded-xl p-3.5">
              <div className="flex items-center justify-between">
                <strong className="text-[12.5px] text-[#1C1917]">{item.label}</strong>
                <span className="text-[14px] font-extrabold text-[#D97757] tabular-nums">{item.score}</span>
              </div>
              <p className="text-[12px] text-[#57534E] leading-relaxed mt-1.5">{item.text}</p>
            </div>
          ))}
        </div>

        {post.aiTranscripts.length > 0 && (
          <div className="mt-4">
            <div className="text-[12.5px] font-bold text-[#1C1917]">Script bài nói và lỗi phát âm</div>
            <div className="text-[11.5px] text-[#78716C]">Từ màu đỏ là vị trí AI phát hiện phát âm chưa rõ.</div>
            <div className="flex flex-col gap-3 mt-3">
              {post.aiTranscripts.map((transcript) => (
                <div key={`${transcript.speakerRole}-${transcript.partNumber}`} className="border border-[#EAE7E3] rounded-xl p-3.5 bg-[#FAFAF8]">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <strong className="text-[13px] text-[#1C1917]">{transcript.speakerName}</strong>
                      <span className="text-[11.5px] text-[#78716C]"> · Vai {transcript.speakerRole} · {transcript.partLabel}</span>
                    </div>
                    <small className="text-[11px] font-bold text-[#DC2626]">{transcript.words.filter((w) => w.hasPronunciationError).length} lỗi phát âm</small>
                  </div>
                  <p className="text-[13.5px] text-[#292524] leading-[1.9]">
                    {transcript.words.map((word, index) => (
                      <span
                        key={`${word.text}-${index}`}
                        title={word.feedback || undefined}
                        style={word.hasPronunciationError ? { color: '#DC2626', fontWeight: 600, textDecoration: 'underline wavy #FCA5A5', textUnderlineOffset: 3 } : undefined}
                      >
                        {word.text}{' '}
                      </span>
                    ))}
                  </p>
                  {transcript.words.some((w) => w.hasPronunciationError) && (
                    <div className="flex flex-col gap-1.5 mt-2.5">
                      {transcript.words.filter((w) => w.hasPronunciationError).map((word, index) => (
                        <div key={`${word.text}-${index}`} className="flex gap-2 text-[12px]">
                          <span className="font-bold text-[#DC2626] shrink-0">{word.text}</span>
                          <p className="text-[#57534E]">{word.feedback}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Peer section */}
      <div className={`bg-white border rounded-2xl shadow-sm p-5 ${focusRing('peer')}`}>
        <div className="flex items-center gap-2 text-[15px] font-bold text-[#1C1917]">
          <span className="material-symbols-rounded icon-fill text-[#D97757]" style={{ fontSize: 19 }}>group</span>
          Nhận xét từ người tham gia
        </div>
        <p className="text-xs text-[#78716C] mt-0.5">Mỗi ghi chú chia theo Part, timestamp tính từ đầu part tương ứng.</p>

        <div className="flex flex-col gap-4 mt-4">
          {post.peerReviews.map((review) => (
            <div key={`${review.reviewerRole}-${review.reviewerName}`}>
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="w-9 h-9 rounded-full grid place-items-center text-white font-bold text-[13px] bg-[#D97757]">{review.reviewerName.charAt(0)}</div>
                <div>
                  <strong className="text-[13px] text-[#1C1917]">{review.reviewerName}</strong>
                  <div className="text-[11.5px] text-[#78716C]">Vai {review.reviewerRole} nhận xét bài của {review.targetName}</div>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {groupNotesByPart(review.notes).map((partGroup) => (
                  <div key={`${review.reviewerRole}-${partGroup.partNumber}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <strong className="text-[12px] text-[#1C1917]">{partGroup.partLabel}</strong>
                      <span className="text-[11px] text-[#78716C]">{partGroup.notes.length} ghi chú</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {partGroup.notes.slice().sort((a, b) => a.timestampMs - b.timestampMs).map((note) => {
                        const config = ERROR_TYPE_CONFIG[note.errorType] || ERROR_TYPE_CONFIG.fluency;
                        return (
                          <div
                            key={`${review.reviewerRole}-${note.partNumber}-${note.timestampMs}-${note.errorType}`}
                            className="rounded-lg bg-[#FAFAF8] border border-[#F1EEEA] p-3 border-l-[3px]"
                            style={{ borderLeftColor: config.borderColor }}
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <span className="text-[10.5px] font-bold text-[#78716C]">Part {note.partNumber}</span>
                              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded" style={{ color: config.borderColor, background: `${config.borderColor}1a` }}>{config.label}</span>
                              <span className="text-[10.5px] text-[#A8A29E] tabular-nums">lúc {formatTimestamp(note.timestampMs)}</span>
                            </div>
                            <p className="text-[12px] font-semibold text-[#292524]">{note.questionText}</p>
                            <p className="text-[12.5px] text-[#57534E] leading-relaxed mt-0.5">{note.noteText}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comments section */}
      <div className={`bg-white border rounded-2xl shadow-sm p-5 ${focusRing('comments')}`}>
        <div className="flex items-center gap-2 text-[15px] font-bold text-[#1C1917]">
          <span className="material-symbols-rounded icon-fill text-[#D97757]" style={{ fontSize: 19 }}>chat_bubble</span>
          Bình luận lớp học
        </div>
        <p className="text-xs text-[#78716C] mt-0.5">Học viên và mentor có thể trao đổi thêm về bài nói đã public.</p>

        <div className="flex flex-col gap-3 mt-4">
          {(post.comments || []).length === 0 && (
            <p className="text-[13px] text-[#A8A29E]">Chưa có bình luận nào.</p>
          )}
          {(post.comments || []).map((comment) => (
            <div key={comment.id} className="flex gap-2.5">
              <div className="w-8 h-8 rounded-full grid place-items-center text-white font-bold text-[12px] bg-[#78716C] shrink-0">{comment.userAvatar}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <strong className="text-[13px] text-[#1C1917]">{comment.userName}</strong>
                  <span className="text-[11px] text-[#A8A29E]">{formatClassroomTime(comment.createdAt)}</span>
                </div>
                <p className="text-[13px] text-[#57534E] leading-relaxed mt-0.5">{comment.commentText}</p>
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-2 pt-2">
            <textarea
              value={commentDraft}
              placeholder="Viết bình luận…"
              onChange={(event) => onChangeCommentDraft(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[#EAE7E3] p-3 text-sm leading-relaxed resize-y focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]"
            />
            <div className="flex justify-end">
              <button
                onClick={() => onSubmitComment(post)}
                disabled={isSubmittingComment}
                className="h-10 px-4 rounded-lg bg-[#D97757] text-white text-[13px] font-semibold hover:brightness-105 disabled:opacity-60"
              >
                {isSubmittingComment ? 'Đang gửi…' : 'Gửi bình luận'}
              </button>
            </div>
          </div>

          {interactionError && <p className="text-sm text-red-600">{interactionError}</p>}
        </div>
      </div>
    </section>
  );
}

function ClassroomPostCardLegacy({ post, onOpenDetail, onToggleLike, onToggleSave }) {
  const peerReviews = post.peerReviews || [];
  const peerNoteCount = post.peerNoteCount ?? peerReviews.reduce((total, review) => total + review.notes.length, 0);

  return (
    <article className="classroom-post-x">
      <div className="post-x-avatar">{post.author.avatar}</div>
      <div className="post-x-content">
        <div className="post-x-header">
          <span className="post-x-name">{post.author.name}</span>
          <span className="post-x-dot">-</span>
          <span className="post-x-time">{post.time}</span>
        </div>

        <div className="post-x-body">
          <h3 className="post-x-title">{post.title}</h3>
          <p className="post-x-desc">{post.description}</p>
        </div>

        <div className="post-participants">
          {post.participants.map((participant) => (
            <div className="post-participant" key={participant.role}>
              <div className="post-participant-avatar">{participant.avatar}</div>
              <div>
                <strong>{participant.name}</strong>
                <span>Vai {participant.role} - Band {participant.band}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="post-x-video">
          <span className="material-symbols-rounded icon-fill">play_circle</span>
          <strong>{post.videoPlaceholder}</strong>
          <small>Video bài nói</small>
        </div>

        <div className="post-x-reviews">
          {post.aiComment && (
            <button
              type="button"
              className="review-section ai-review review-open-button"
              onClick={() => onOpenDetail(post, 'ai')}
            >
              <div className="review-header">
                <span className="material-symbols-rounded icon-fill">robot_2</span>
                <strong>Nhận xét từ AI</strong>
              </div>
              <span className="review-open-copy">Mở trang chi tiết đánh giá theo từng tiêu chí</span>
              <span className="material-symbols-rounded review-open-icon">chevron_right</span>
            </button>
          )}

          {(peerReviews.length > 0 || peerNoteCount > 0) && (
            <button
              type="button"
              className="review-section peer-review review-open-button"
              onClick={() => onOpenDetail(post, 'peer')}
            >
              <div className="review-header">
                <span className="material-symbols-rounded icon-fill">group</span>
                <strong>Nhận xét từ người tham gia</strong>
              </div>
              <span className="review-open-copy">
                {post.peerReviews.length} người nhận xét · {peerNoteCount} ghi chú lỗi
              </span>
              <span className="material-symbols-rounded review-open-icon">chevron_right</span>
            </button>
          )}
        </div>

        <div className="post-x-actions">
          <button type="button" className="action-btn" aria-label="Bình luận">
            <span className="material-symbols-rounded">chat_bubble</span>
            <span>{post.commentsCount}</span>
          </button>
          <button type="button" className="action-btn" aria-label="Tym">
            <span className="material-symbols-rounded">favorite</span>
            <span>{post.likes}</span>
          </button>
          <button type="button" className="action-btn" aria-label="Lưu">
            <span className="material-symbols-rounded">bookmark</span>
            <span>{post.saves}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function ClassroomPostCard({ post, onOpenDetail, onToggleLike = () => {}, onToggleSave = () => {} }) {
  const peerReviews = post.peerReviews || [];
  const peerNoteCount = post.peerNoteCount ?? peerReviews.reduce((total, review) => total + review.notes.length, 0);
  const isMentorPost = post.sessionMode === 'mentor';
  const bandValue = post.overallBand != null ? Number(post.overallBand).toFixed(1) : null;

  return (
    <article className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm overflow-hidden transition-shadow hover:shadow-[0_2px_6px_rgba(28,25,23,.05),0_12px_32px_-8px_rgba(28,25,23,.1)] hover:border-[#E0DBD5]">
      {/* Header */}
      <div className="flex items-center gap-3 px-[18px] pt-[15px]">
        <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold text-[15px] shrink-0 bg-[#0D9488]">
          {post.author.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#1C1917]">{post.author.name}</div>
          <div className="text-xs text-[#78716C]">{formatClassroomTime(post.time)}</div>
        </div>
        {isMentorPost && (
          <span className="text-[11px] font-bold text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9] px-2.5 py-0.5 rounded-full">Mentor</span>
        )}
      </div>

      {/* Body */}
      <div className="px-[18px] pt-3">
        <h3 className="text-base font-bold tracking-tight leading-snug text-[#1C1917]">{post.title}</h3>
        <p className="text-[13.5px] text-[#57534E] leading-relaxed mt-1.5">{post.description}</p>
      </div>

      {/* Tags: participants bands */}
      <div className="flex flex-wrap gap-1.5 px-[18px] pt-3">
        {post.topic?.name && (
          <span className="text-[11.5px] font-semibold text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9] px-2.5 py-[3px] rounded-md">{post.topic.name}</span>
        )}
        {post.participants.filter((p) => p.band != null).map((p) => (
          <span key={p.role} className="text-[11.5px] font-semibold text-[#57534E] bg-[#FAFAF8] border border-[#EAE7E3] px-2.5 py-[3px] rounded-md">{p.name} · Band {p.band}</span>
        ))}
      </div>

      {/* Video thumbnail */}
      <button
        type="button"
        onClick={() => onOpenDetail(post, 'ai')}
        className="relative block w-[calc(100%-36px)] mx-[18px] mt-3.5 aspect-video rounded-xl overflow-hidden group"
        style={{ background: '#1C1917' }}
      >
        <span className="absolute inset-0 grid place-items-center">
          <span className="w-14 h-14 rounded-full bg-white/95 grid place-items-center shadow-lg group-hover:scale-105 transition-transform">
            <span className="material-symbols-rounded icon-fill text-[#D97757]" style={{ fontSize: 26 }}>play_arrow</span>
          </span>
        </span>
        <span className="absolute left-3 bottom-3 text-[11.5px] font-semibold text-white bg-black/50 backdrop-blur px-2.5 py-1 rounded-md">
          {post.participants.map((p) => p.name).filter(Boolean).join(' & ')} · {post.videoPlaceholder}
        </span>
      </button>

      {/* AI band + peer notes strip */}
      {(bandValue || peerNoteCount > 0 || post.aiComment) && (
        <button
          type="button"
          onClick={() => onOpenDetail(post, bandValue ? 'ai' : 'peer')}
          className="flex items-center gap-3.5 w-[calc(100%-36px)] mx-[18px] mt-3.5 px-3.5 py-3 border border-[#EAE7E3] rounded-xl text-left hover:border-[#EAC7B9]"
          style={{ background: '#FBF4EF' }}
        >
          {bandValue && (
            <div className="flex flex-col items-center pr-3.5 border-r border-[#EAC7B9]">
              <b className="text-[22px] font-extrabold tracking-tight text-[#D97757] tabular-nums leading-none">{bandValue}</b>
              <span className="text-[10px] uppercase tracking-wide text-[#78716C] font-bold mt-1">AI Band</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#1C1917]">
              <span className="material-symbols-rounded icon-fill text-[#D97757]" style={{ fontSize: 17 }}>robot_2</span>
              Nhận xét từ AI &amp; người nghe
            </div>
            <p className="text-xs text-[#78716C] mt-0.5 line-clamp-1">{post.aiComment}</p>
          </div>
          {peerNoteCount > 0 && (
            <span className="text-[11px] font-bold text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9] px-2.5 py-1 rounded-full whitespace-nowrap">{peerNoteCount} ghi chú</span>
          )}
          <span className="material-symbols-rounded text-[#A8A29E]" style={{ fontSize: 18 }}>chevron_right</span>
        </button>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 py-3 mt-3.5 border-t border-[#F1EEEA]">
        <button type="button" onClick={() => onOpenDetail(post, 'comments')} aria-label="Bình luận"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#78716C] px-3 py-1.5 rounded-lg hover:bg-[#F1EEEA] hover:text-[#1C1917]">
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>chat_bubble</span>
          <span className="tabular-nums">{post.commentsCount}</span>
        </button>
        <button type="button" onClick={() => onToggleLike(post)} aria-label="Thích"
          className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#F1EEEA] ${post.isLiked ? 'text-[#DC2626]' : 'text-[#78716C] hover:text-[#1C1917]'}`}>
          <span className="material-symbols-rounded" style={{ fontSize: 18, fontVariationSettings: post.isLiked ? "'FILL' 1" : undefined }}>favorite</span>
          <span className="tabular-nums">{post.likes}</span>
        </button>
        <button type="button" onClick={() => onToggleSave(post)} aria-label="Lưu"
          className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#F1EEEA] ${post.isSaved ? 'text-[#D97757]' : 'text-[#78716C] hover:text-[#1C1917]'}`}>
          <span className="material-symbols-rounded" style={{ fontSize: 18, fontVariationSettings: post.isSaved ? "'FILL' 1" : undefined }}>bookmark</span>
          <span className="tabular-nums">{post.saves}</span>
        </button>
        <button type="button" onClick={() => onOpenDetail(post, 'ai')}
          className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-[#57534E] px-3 py-1.5 rounded-lg hover:bg-[#F1EEEA] hover:text-[#1C1917]">
          Xem chi tiết
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>chevron_right</span>
        </button>
      </div>
    </article>
  );
}

function ClassroomPanel() {
  const [detailView, setDetailView] = useState(null);

  useEffect(() => {
    if (!detailView) return;
    document.querySelector('.app-main')?.scrollTo({ top: 0, left: 0 });
  }, [detailView]);

  if (detailView) {
    return (
      <div className="classroom-layout classroom-layout-single">
        <ClassroomPostDetail
          post={detailView.post}
          focusSection={detailView.focusSection}
          onBack={() => setDetailView(null)}
        />
      </div>
    );
  }

  return (
    <div className="classroom-layout classroom-layout-single">
      <section className="classroom-feed">
        {CLASSROOM_POSTS.map((post) => (
          <ClassroomPostCard
            key={post.id}
            post={post}
            onOpenDetail={(selectedPost, focusSection) => setDetailView({ post: selectedPost, focusSection })}
          />
        ))}
      </section>
    </div>
  );
}

function formatClassroomTime(value) {
  if (!value) return 'Vừa đăng';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function normalizeClassroomPost(post) {
  return {
    ...post,
    time: formatClassroomTime(post.time),
    commentsCount: post.commentsCount ?? 0,
    likes: post.likes ?? 0,
    saves: post.saves ?? 0,
    isLiked: Boolean(post.isLiked),
    isSaved: Boolean(post.isSaved),
    comments: post.comments || [],
    peerReviews: post.peerReviews || [],
    aiTranscripts: post.aiTranscripts || [],
    participants: post.participants || [],
    author: post.author || { name: 'Try Your Speech', avatar: 'YS' },
  };
}

function ClassroomPanelReal() {
  const currentUserId = getStoredCurrentUserId();
  const [posts, setPosts] = useState([]);
  const [detailView, setDetailView] = useState(null);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError] = useState('');
  const [interactionError, setInteractionError] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPosts() {
      setLoadStatus('loading');
      setLoadError('');

      try {
        const data = await getClassroomPosts(currentUserId);
        if (!cancelled) {
          setPosts((data.posts || []).map(normalizeClassroomPost));
          setLoadStatus('loaded');
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message);
          setLoadStatus('error');
        }
      }
    }

    loadPosts();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!detailView) return;
    document.querySelector('.app-main')?.scrollTo({ top: 0, left: 0 });
  }, [detailView]);

  async function handleOpenDetail(post, focusSection) {
    setLoadError('');
    setInteractionError('');
    setCommentDraft('');

    try {
      const data = await getClassroomPost(post.id, currentUserId);
      setDetailView({
        post: normalizeClassroomPost(data.post),
        focusSection,
      });
    } catch (err) {
      setLoadError(err.message);
    }
  }

  function requireCurrentUser() {
    if (currentUserId) {
      return true;
    }

    setInteractionError('Bạn cần có profile học viên trước khi tương tác.');
    return false;
  }

  function updatePostInteraction(postId, patch) {
    setPosts((currentPosts) => currentPosts.map((post) => (
      post.id === postId ? { ...post, ...patch } : post
    )));

    setDetailView((currentDetail) => {
      if (!currentDetail || currentDetail.post.id !== postId) {
        return currentDetail;
      }

      return {
        ...currentDetail,
        post: {
          ...currentDetail.post,
          ...patch,
        },
      };
    });
  }

  async function handleToggleLike(post) {
    if (!requireCurrentUser()) return;

    setInteractionError('');

    try {
      const result = await toggleClassroomLike({
        postId: post.id,
        userId: currentUserId,
      });
      updatePostInteraction(post.id, {
        likes: result.likes,
        isLiked: result.isLiked,
      });
    } catch (err) {
      setInteractionError(err.message);
    }
  }

  async function handleToggleSave(post) {
    if (!requireCurrentUser()) return;

    setInteractionError('');

    try {
      const result = await toggleClassroomSave({
        postId: post.id,
        userId: currentUserId,
      });
      updatePostInteraction(post.id, {
        saves: result.saves,
        isSaved: result.isSaved,
      });
    } catch (err) {
      setInteractionError(err.message);
    }
  }

  async function handleSubmitComment(post) {
    if (!requireCurrentUser()) return;

    const safeComment = commentDraft.trim();
    if (!safeComment) {
      setInteractionError('Vui lòng nhập nội dung bình luận.');
      return;
    }

    setInteractionError('');
    setSubmittingCommentPostId(post.id);

    try {
      const result = await addClassroomComment({
        postId: post.id,
        userId: currentUserId,
        commentText: safeComment,
      });
      const nextComments = [...(detailView?.post.comments || []), result.comment];
      setCommentDraft('');
      updatePostInteraction(post.id, {
        comments: nextComments,
        commentsCount: result.commentsCount,
      });
    } catch (err) {
      setInteractionError(err.message);
    } finally {
      setSubmittingCommentPostId(null);
    }
  }

  if (detailView) {
    return (
      <div className="classroom-layout classroom-layout-single">
        <ClassroomPostDetail
          post={detailView.post}
          focusSection={detailView.focusSection}
          commentDraft={commentDraft}
          interactionError={interactionError}
          isSubmittingComment={submittingCommentPostId === detailView.post.id}
          onBack={() => setDetailView(null)}
          onChangeCommentDraft={setCommentDraft}
          onSubmitComment={handleSubmitComment}
          onToggleLike={handleToggleLike}
          onToggleSave={handleToggleSave}
        />
      </div>
    );
  }

  return (
    <div className="classroom-layout classroom-layout-single">
      <section className="classroom-feed">
        {loadStatus === 'loading' && (
          <div className="empty-state">
            <div className="spinner" />
            <h3>Đang tải lớp học</h3>
            <p>Hệ thống đang lấy các bài đã public từ máy chủ.</p>
          </div>
        )}

        {loadStatus === 'error' && (
          <div className="empty-state">
            <span className="material-symbols-rounded">error</span>
            <h3>Không tải được lớp học</h3>
            <p>{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Tải lại
            </Button>
          </div>
        )}

        {loadStatus === 'loaded' && posts.length === 0 && (
          <div className="empty-state">
            <span className="material-symbols-rounded">forum</span>
            <h3>Chưa có bài public</h3>
            <p>Các phiên đã hoàn thành và được public sẽ xuất hiện tại đây.</p>
          </div>
        )}

        {loadError && loadStatus === 'loaded' && (
          <div className="topic-feedback error">{loadError}</div>
        )}

        {interactionError && loadStatus === 'loaded' && (
          <div className="topic-feedback error">{interactionError}</div>
        )}

        {posts.map((post) => (
          <ClassroomPostCard
            key={post.id}
            post={post}
            onOpenDetail={handleOpenDetail}
            onToggleLike={handleToggleLike}
            onToggleSave={handleToggleSave}
          />
        ))}
      </section>
    </div>
  );
}

function UserHistoryPanel() {
  return (
    <div className="workspace-panel">
      <section className="workspace-hero">
        <div>
          <div className="section-eyebrow">Người dùng</div>
          <h2>Lịch sử bài thực hành</h2>
          <p>Xem lại các phiên luyện nói đã hoàn thành và chọn bài phù hợp để gửi yêu cầu public lên Lớp học.</p>
        </div>
      </section>

      <section className="history-list">
        <div className="history-list-head">
          <span>Bài thực hành</span>
          <span>Đối tác</span>
          <span>Kết quả</span>
          <span>Trạng thái</span>
          <span>Thao tác</span>
        </div>
        {PRACTICE_HISTORY.map((item) => (
          <article className="history-row" key={item.id}>
            <div className="history-row-main">
              <span className="history-date">{item.date}</span>
              <h3>{item.topic}</h3>
              <p>{item.duration} · {item.status}</p>
            </div>

            <div className="history-row-cell">
              <strong>{item.partnerName}</strong>
              <span>Đối tác luyện tập</span>
            </div>

            <div className="history-row-cell">
              <strong>Band {item.bandEstimate}</strong>
              <span>{item.notesCount} ghi chú lỗi</span>
            </div>

            <div className="history-row-cell">
              <span className={`status-pill ${item.publicStatus === 'Đã public' ? 'success' : item.publicStatus === 'Đang chờ duyệt' ? 'warning' : ''}`}>
                {item.publicStatus}
              </span>
            </div>

            <div className="history-row-actions">
              <Button variant="outline" size="sm">
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>visibility</span>
                Xem chi tiết
              </Button>
              <Button size="sm">
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>publish</span>
                Public lên lớp học
              </Button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function getStoredCurrentUserId() {
  return localStorage.getItem('tryYourSpeech.currentUserId');
}

function formatHistoryDate(value) {
  if (!value) return 'Chưa bắt đầu';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatHistoryDuration(durationMs) {
  const minutes = Math.max(1, Math.round((Number(durationMs) || 0) / 60000));
  return `${minutes} phút`;
}

function getHistoryStatusLabel(item) {
  const labels = {
    ai_completed: 'Đã chấm AI',
    ai_failed: 'AI lỗi',
    processing: 'Đang xử lý AI',
    reviewing: 'Đang review',
    mentor_reviewed: 'Mentor đã đánh giá',
    waiting_mentor_review: 'Chờ mentor đánh giá',
    in_progress: 'Đang luyện tập',
    completed: 'Hoàn tất',
    abandoned: 'Đã huỷ',
  };

  return labels[item.resultStatus] || item.status;
}

function getHistoryStatusClass(item) {
  if (['ai_completed', 'mentor_reviewed', 'completed'].includes(item.resultStatus)) {
    return 'success';
  }

  if (['processing', 'reviewing', 'waiting_mentor_review', 'in_progress'].includes(item.resultStatus)) {
    return 'warning';
  }

  return '';
}

function getPartnerRoleLabel(item) {
  if (item.partner?.userRole === 'mentor') {
    return 'Mentor';
  }

  return item.sessionMode === 'mentor' ? 'Học viên' : 'Đối tác luyện tập';
}

function UserHistoryPanelReal() {
  const { state, dispatch } = useSession();
  const navigate = useNavigate();
  const currentUserId = state.userId || getStoredCurrentUserId();
  const [history, setHistory] = useState(null);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError] = useState('');
  const [openingSessionId, setOpeningSessionId] = useState(null);
  const [publishingSessionId, setPublishingSessionId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!currentUserId) {
      setHistory(null);
      setLoadStatus('idle');
      return undefined;
    }

    let cancelled = false;

    async function loadHistory() {
      setLoadStatus('loading');
      setLoadError('');

      try {
        const data = await getPracticeHistory(currentUserId);
        if (!cancelled) {
          setHistory(data);
          setLoadStatus('loaded');
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message);
          setLoadStatus('error');
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, reloadKey]);

  async function handleOpenResults(item) {
    if (!currentUserId) return;

    setOpeningSessionId(item.id);
    setLoadError('');

    try {
      const [sessionData, results] = await Promise.all([
        getSession(item.id),
        getResults(item.id, currentUserId),
      ]);

      dispatch({
        type: 'SET_USER',
        payload: {
          userId: currentUserId,
          displayName: history?.user?.displayName || state.displayName,
          band: history?.user?.band ?? state.band,
        },
      });
      dispatch({ type: 'SET_SESSION_DATA', payload: sessionData });
      dispatch({ type: 'SET_RESULTS', payload: results });
      navigate('/results');
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setOpeningSessionId(null);
    }
  }

  async function handlePublishSession(item) {
    if (!currentUserId) return;

    setPublishingSessionId(item.id);
    setLoadError('');

    try {
      await publishClassroomPost({
        sessionId: item.id,
        userId: currentUserId,
        title: item.topic?.name || 'IELTS Speaking practice',
        description: `Bai luyen voi ${item.partner?.displayName || 'doi tac'} - ${getHistoryStatusLabel(item)}`,
      });
      setReloadKey((key) => key + 1);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setPublishingSessionId(null);
    }
  }

  const sessions = history?.sessions || [];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Người dùng</div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1C1917] mt-1">Lịch sử luyện tập</h1>
        <p className="text-sm text-[#78716C] mt-1">Xem lại các phiên đã tham gia, kết quả AI hoặc nhận xét mentor, và chia sẻ lên Lớp học.</p>
      </div>

      {!currentUserId && (
        <div className="text-center py-16 text-[#78716C]">
          <p className="font-semibold text-[#1C1917]">Chưa có người dùng hiện tại</p>
          <p className="text-sm mt-1">Hãy hoàn thành một phiên luyện tập để hệ thống ghi nhận lịch sử.</p>
        </div>
      )}

      {currentUserId && loadStatus === 'loading' && (
        <div className="text-center py-16 text-sm text-[#78716C]">Đang tải lịch sử…</div>
      )}

      {currentUserId && loadStatus === 'error' && (
        <div className="text-center py-16 text-[#78716C]">
          <p className="font-semibold text-[#1C1917]">Không tải được lịch sử</p>
          <p className="text-sm mt-1">{loadError}</p>
          <button onClick={() => setReloadKey((key) => key + 1)} className="mt-3 text-sm font-semibold text-[#D97757] hover:underline">Thử lại</button>
        </div>
      )}

      {currentUserId && loadStatus === 'loaded' && sessions.length === 0 && (
        <div className="text-center py-16 text-[#78716C]">
          <p className="font-semibold text-[#1C1917]">Chưa có phiên luyện tập</p>
          <p className="text-sm mt-1">Các phiên peer hoặc mentor bạn tham gia sẽ xuất hiện tại đây.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {sessions.map((item) => {
          const isPublished = item.publicStatus === 'published';
          const isPending = item.publicStatus === 'pending';
          return (
            <article key={item.id} className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-[#8A4A33]">{formatHistoryDate(item.startedAt || item.createdAt)}</div>
                <h3 className="text-[15px] font-bold tracking-tight text-[#1C1917] mt-0.5">{item.topic?.name || 'IELTS Speaking'}</h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#78716C] mt-1.5">
                  <span>{formatHistoryDuration(item.plannedDurationMs)}</span>
                  <span className="text-[#D6D3D1]">·</span>
                  <span>{getPartnerRoleLabel(item)}: <b className="text-[#1C1917] font-semibold">{item.partner?.displayName || 'Không rõ'}</b></span>
                  <span className="text-[#D6D3D1]">·</span>
                  <span>{item.notesReceivedCount} ghi chú nhận được</span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-[17px] font-extrabold tracking-tight text-[#D97757] tabular-nums leading-none">{item.overallBand ? item.overallBand : '—'}</div>
                  <div className="text-[10px] uppercase tracking-wide text-[#A8A29E] font-bold mt-0.5">Band</div>
                </div>
                <span className={`text-[11.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                  isPublished ? 'text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0]'
                  : isPending ? 'text-[#B45309] bg-[#FEF6E7] border border-[#FCD9A5]'
                  : 'text-[#78716C] bg-[#F1EEEA] border border-[#EAE7E3]'
                }`}>
                  {isPublished ? 'Đã public' : isPending ? 'Chờ đồng ý' : getHistoryStatusLabel(item)}
                </span>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleOpenResults(item)}
                  disabled={openingSessionId === item.id}
                  className="h-10 px-3.5 rounded-lg border border-[#EAE7E3] text-[13px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] disabled:opacity-60 whitespace-nowrap"
                >
                  {openingSessionId === item.id ? 'Đang mở…' : 'Xem kết quả'}
                </button>
                <button
                  onClick={() => handlePublishSession(item)}
                  disabled={publishingSessionId === item.id || isPublished || isPending || item.status !== 'completed'}
                  className="h-10 px-3.5 rounded-lg bg-[#D97757] text-white text-[13px] font-semibold hover:brightness-105 disabled:opacity-45 disabled:hover:brightness-100 whitespace-nowrap"
                >
                  {isPublished ? 'Đã public' : isPending ? 'Đã gửi yêu cầu' : publishingSessionId === item.id ? 'Đang gửi…' : 'Xin đăng bài'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function NotificationsPanel() {
  return (
    <div className="workspace-panel">
      <section className="workspace-hero">
        <div>
          <div className="section-eyebrow">Thông báo</div>
          <h2>Cập nhật hoạt động học tập</h2>
          <p>Theo dõi bài đăng mới trên Lớp học, trạng thái duyệt bài và nhận xét mới từ người tham gia.</p>
        </div>
      </section>

      <section className="notification-list">
        {NOTIFICATIONS.map((item) => (
          <article className={`notification-row ${item.status}`} key={item.id}>
            <div className="notification-icon">
              <span className="material-symbols-rounded icon-fill">{item.icon}</span>
            </div>
            <div className="notification-content">
              <div>
                <h3>{item.title}</h3>
                <span>{item.time}</span>
              </div>
              <p>{item.description}</p>
            </div>
            <Button variant="outline" size="sm">Xem</Button>
          </article>
        ))}
      </section>
    </div>
  );
}

function getNotificationIcon(type) {
  if (type === 'mentor_review_completed') return 'rate_review';
  if (type === 'classroom_post_published') return 'campaign';
  if (type === 'ai_result_completed') return 'robot_2';
  return 'notifications';
}

function formatNotificationDate(value) {
  if (!value) return 'Vua xong';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const NOTI_STYLE = {
  classroom_consent_request: { icon: 'verified_user', fg: '#D97757', bg: '#F7ECE6' },
  classroom_post_published: { icon: 'task_alt', fg: '#059669', bg: '#ECFDF5' },
  classroom_consent_declined: { icon: 'cancel', fg: '#DC2626', bg: '#FEF2F2' },
  mentor_session_chosen: { icon: 'co_present', fg: '#7C3AED', bg: '#F5F3FF' },
  mentor_session_not_chosen: { icon: 'groups', fg: '#78716C', bg: '#F1EEEA' },
  mentor_session_applied: { icon: 'person_add', fg: '#2563EB', bg: '#EFF6FF' },
  mentor_review_completed: { icon: 'rate_review', fg: '#2563EB', bg: '#EFF6FF' },
  default: { icon: 'notifications', fg: '#D97757', bg: '#F7ECE6' },
};

function NotificationsPanelReal() {
  const currentUserId = getStoredCurrentUserId();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError] = useState('');
  const [markingId, setMarkingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [consentBusyId, setConsentBusyId] = useState(null);
  const [resolvedMap, setResolvedMap] = useState({});

  useEffect(() => {
    if (!currentUserId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoadStatus('idle');
      return undefined;
    }

    let cancelled = false;

    async function loadNotifications() {
      setLoadStatus('loading');
      setLoadError('');

      try {
        const data = await getNotifications(currentUserId);
        if (!cancelled) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
          setLoadStatus('loaded');
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message);
          setLoadStatus('error');
        }
      }
    }

    loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, reloadKey]);

  // Refetch the open panel when a realtime notification arrives.
  useEffect(() => {
    if (!currentUserId) return undefined;
    startNotificationsRealtime();
    return onNotification(() => {
      setReloadKey((key) => key + 1);
      setTimeout(() => setReloadKey((key) => key + 1), 700);
    });
  }, [currentUserId]);

  async function handleMarkRead(notification) {
    if (!currentUserId || notification.isRead) return;

    setMarkingId(notification.id);
    setLoadError('');

    try {
      await markNotificationRead(currentUserId, notification.id);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setMarkingId(null);
    }
  }

  async function handleMarkAllRead() {
    if (!currentUserId || unreadCount === 0) return;

    setLoadError('');

    try {
      await markAllNotificationsRead(currentUserId);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setLoadError(err.message);
    }
  }

  async function handleConsent(item, decision) {
    if (!currentUserId || !item.entityId) return;

    setConsentBusyId(item.id);
    setLoadError('');
    try {
      if (decision === 'approve') {
        await approveClassroomPost({ postId: item.entityId, userId: currentUserId });
      } else {
        await declineClassroomPost({ postId: item.entityId, userId: currentUserId });
      }
      setResolvedMap((prev) => ({ ...prev, [item.id]: decision }));
      await markNotificationRead(currentUserId, item.id).catch(() => {});
      setReloadKey((key) => key + 1);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setConsentBusyId(null);
    }
  }

  const pendingConsent = notifications.filter(
    (n) => n.type === 'classroom_consent_request' && !resolvedMap[n.id]
  ).length;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Thông báo</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1C1917] mt-1">Hộp thông báo</h1>
        </div>
        <button
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#57534E] bg-white border border-[#EAE7E3] px-3 py-2 rounded-lg hover:border-[#EAC7B9] hover:text-[#8A4A33] disabled:opacity-50"
        >
          <span className="material-symbols-rounded" style={{ fontSize: 15 }}>done_all</span>
          Đánh dấu đã đọc tất cả
        </button>
      </div>

      {pendingConsent > 0 && (
        <div className="mb-4 flex items-center gap-2 text-[13px] text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9] rounded-lg px-3.5 py-2.5">
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>verified_user</span>
          Bạn có <b>{pendingConsent}</b> yêu cầu đăng bài đang chờ phản hồi.
        </div>
      )}

      {!currentUserId && (
        <div className="text-center py-16 text-[#78716C]">
          <p className="font-semibold text-[#1C1917]">Chưa có người dùng hiện tại</p>
          <p className="text-sm mt-1">Hãy tham gia một phiên luyện tập để hệ thống biết hiện thông báo cho ai.</p>
        </div>
      )}

      {currentUserId && loadStatus === 'loading' && (
        <div className="text-center py-16 text-[#78716C] text-sm">Đang tải thông báo…</div>
      )}

      {currentUserId && loadStatus === 'error' && (
        <div className="text-center py-16 text-[#78716C]">
          <p className="font-semibold text-[#1C1917]">Không tải được thông báo</p>
          <p className="text-sm mt-1">{loadError}</p>
          <button onClick={() => setReloadKey((key) => key + 1)} className="mt-3 text-sm font-semibold text-[#D97757] hover:underline">Thử lại</button>
        </div>
      )}

      {currentUserId && loadStatus === 'loaded' && notifications.length === 0 && (
        <div className="text-center py-16 text-[#78716C]">
          <p className="font-semibold text-[#1C1917]">Chưa có thông báo</p>
          <p className="text-sm mt-1">Khi có yêu cầu đăng bài, mentor chọn bạn, hay bài được public, thông báo sẽ xuất hiện tại đây.</p>
        </div>
      )}

      {loadError && loadStatus === 'loaded' && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</div>
      )}

      <div className="flex flex-col gap-2.5">
        {notifications.map((item) => {
          const style = NOTI_STYLE[item.type] || NOTI_STYLE.default;
          const isConsent = item.type === 'classroom_consent_request';
          const resolved = resolvedMap[item.id];
          const isChosen = item.type === 'mentor_session_chosen';
          const unread = !item.isRead;

          return (
            <article
              key={item.id}
              className={`relative flex gap-3.5 p-4 bg-white border rounded-xl shadow-sm ${unread ? 'border-[#EAC7B9]' : 'border-[#EAE7E3]'}`}
              style={unread ? { background: '#F7ECE6' } : undefined}
              onClick={() => handleMarkRead(item)}
            >
              {unread && <span className="absolute left-[-1px] top-4 bottom-4 w-[3px] rounded-full bg-[#D97757]" />}
              <div className="w-10 h-10 rounded-[11px] grid place-items-center shrink-0" style={{ color: style.fg, background: style.bg }}>
                <span className="material-symbols-rounded icon-fill" style={{ fontSize: 20 }}>{style.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2.5">
                  <div className="text-[13.5px] leading-snug text-[#1C1917]">{item.title}</div>
                  <span className="text-[11.5px] text-[#A8A29E] whitespace-nowrap shrink-0">{formatNotificationDate(item.createdAt)}</span>
                </div>
                {item.body && <p className="text-[12.5px] text-[#78716C] leading-relaxed mt-1">{item.body}</p>}

                {isConsent && !resolved && (
                  <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleConsent(item, 'approve')}
                      disabled={consentBusyId === item.id}
                      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#059669] text-white text-[13px] font-semibold hover:brightness-105 disabled:opacity-60"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 16 }}>check</span>
                      Đồng ý đăng
                    </button>
                    <button
                      onClick={() => handleConsent(item, 'decline')}
                      disabled={consentBusyId === item.id}
                      className="h-10 px-4 rounded-lg border border-[#EAE7E3] text-[13px] font-semibold text-[#57534E] hover:border-red-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      Từ chối
                    </button>
                  </div>
                )}

                {isConsent && resolved === 'approve' && (
                  <div className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] px-3 py-1.5 rounded-lg">
                    <span className="material-symbols-rounded" style={{ fontSize: 15 }}>check</span>
                    Bạn đã đồng ý · bài đã được public
                  </div>
                )}
                {isConsent && resolved === 'decline' && (
                  <div className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#78716C] bg-[#F1EEEA] border border-[#EAE7E3] px-3 py-1.5 rounded-lg">
                    Bạn đã từ chối yêu cầu này
                  </div>
                )}

                {isChosen && (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate('/mentor'); }}
                    className="mt-3 inline-flex items-center gap-1.5 h-11 px-5 rounded-lg bg-[#D97757] text-white text-[14px] font-semibold hover:brightness-105 shadow-[0_4px_12px_-2px_rgba(217,119,87,.5)]"
                  >
                    <span className="material-symbols-rounded icon-fill" style={{ fontSize: 16 }}>play_arrow</span>
                    Vào phiên học
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function TeacherReviewsPanel() {
  return (
    <div className="workspace-panel">
      <section className="workspace-hero teacher-hero">
        <div>
          <div className="section-eyebrow">Giáo viên</div>
          <h2>Bài thực hành của học viên</h2>
          <p>Xem lại toàn bộ bài thực hành, kiểm tra chất lượng và chọn bài phù hợp để public lên Lớp học.</p>
        </div>
      </section>

      <section className="teacher-review-list">
        <div className="panel-heading">
          <h3>Danh sách bài thực hành</h3>
          <span>{TEACHER_PRACTICE_REVIEWS.length} phiên</span>
        </div>

        {TEACHER_PRACTICE_REVIEWS.map((item) => (
          <article className="teacher-session-card" key={item.id}>
            <div className="teacher-session-main">
              <div>
                <span className="history-date">{item.date}</span>
                <h4>{item.topic}</h4>
                <p>{item.students.join(' và ')} · Band trung bình {item.averageBand}</p>
              </div>
              <span className="status-pill">{item.teacherStatus}</span>
            </div>
            <div className="teacher-session-actions">
              <Button variant="outline" size="sm">
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>rate_review</span>
                Xem bài
              </Button>
              <Button size="sm">
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>publish</span>
                Public lên lớp học
              </Button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function getStudentWorkStatusLabel(item) {
  if (item.reviewStatus === 'published') return 'Đã public';
  if (item.reviewStatus === 'ready_to_publish') return 'Sẵn sàng public';
  if (item.reviewStatus === 'needs_mentor_review') return 'Cần mentor nhận xét';
  if (item.reviewStatus === 'processing') return 'Đang xử lý AI';
  if (item.reviewStatus === 'waiting_review') return 'Đang chờ review';
  return 'Đang luyện tập';
}

function getStudentWorkStatusClass(item) {
  if (item.reviewStatus === 'published') return 'success';
  if (item.reviewStatus === 'ready_to_publish') return 'warning';
  return '';
}

function getStudentWorkTitle(item) {
  const studentNames = (item.participants || [])
    .filter((participant) => participant.userRole === 'student')
    .map((participant) => participant.displayName)
    .join(' va ');

  return `${item.topic?.name || 'IELTS Speaking'} - ${studentNames || 'Hoc vien'}`;
}

function TeacherReviewsPanelReal() {
  const { state, dispatch } = useSession();
  const navigate = useNavigate();
  const [studentWork, setStudentWork] = useState([]);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError] = useState('');
  const [openingSessionId, setOpeningSessionId] = useState(null);
  const [publishingSessionId, setPublishingSessionId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadStudentWork() {
      setLoadStatus('loading');
      setLoadError('');

      try {
        const data = await getStudentWork({ limit: 80 });
        if (!cancelled) {
          setStudentWork(data.sessions || []);
          setLoadStatus('loaded');
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message);
          setLoadStatus('error');
        }
      }
    }

    loadStudentWork();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleOpenStudentResult(item) {
    const student = item.primaryStudent || item.participants?.[0];
    if (!student?.id) return;

    setOpeningSessionId(item.id);
    setLoadError('');

    try {
      const [sessionData, results] = await Promise.all([
        getSession(item.id),
        getResults(item.id, student.id),
      ]);

      dispatch({
        type: 'SET_USER',
        payload: {
          userId: student.id,
          displayName: student.displayName || state.displayName,
          band: student.band ?? state.band,
        },
      });
      dispatch({ type: 'SET_SESSION_DATA', payload: sessionData });
      dispatch({ type: 'SET_RESULTS', payload: results });
      navigate('/results');
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setOpeningSessionId(null);
    }
  }

  async function handlePublishStudentWork(item) {
    const student = item.primaryStudent || item.participants?.[0];
    if (!student?.id) return;

    setPublishingSessionId(item.id);
    setLoadError('');

    try {
      await publishClassroomPost({
        sessionId: item.id,
        userId: student.id,
        title: getStudentWorkTitle(item),
        description: item.mentorReviewSummary || `Bài học viên ${student.displayName || ''} đã hoàn thành và sẵn sàng chia sẻ.`,
      });
      setReloadKey((key) => key + 1);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setPublishingSessionId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Mentor</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1C1917] mt-1">Bài học viên</h1>
          <p className="text-sm text-[#78716C] mt-1">Xem các phiên học viên đã luyện, kiểm tra ghi chú/kết quả và xin đăng bài tốt lên Lớp học.</p>
        </div>
        <span className="text-[12.5px] text-[#78716C] whitespace-nowrap">{loadStatus === 'loading' ? 'Đang tải…' : `${studentWork.length} phiên`}</span>
      </div>

      {loadStatus === 'loading' && (
        <div className="text-center py-16 text-sm text-[#78716C]">Đang tải bài học viên…</div>
      )}

      {loadStatus === 'error' && (
        <div className="text-center py-16 text-[#78716C]">
          <p className="font-semibold text-[#1C1917]">Không tải được bài học viên</p>
          <p className="text-sm mt-1">{loadError}</p>
          <button onClick={() => setReloadKey((key) => key + 1)} className="mt-3 text-sm font-semibold text-[#D97757] hover:underline">Thử lại</button>
        </div>
      )}

      {loadStatus === 'loaded' && studentWork.length === 0 && (
        <div className="text-center py-16 text-[#78716C]">
          <p className="font-semibold text-[#1C1917]">Chưa có bài học viên</p>
          <p className="text-sm mt-1">Các phiên peer hoặc mentor sẽ xuất hiện tại đây sau khi được tạo.</p>
        </div>
      )}

      {loadError && loadStatus === 'loaded' && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</div>
      )}

      <div className="flex flex-col gap-3">
        {studentWork.map((item) => {
          const studentNames = (item.participants || [])
            .filter((participant) => participant.userRole === 'student')
            .map((participant) => participant.displayName)
            .join(' và ');
          const isPublished = item.publicStatus === 'published';

          return (
            <article key={item.id} className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#8A4A33]">{formatHistoryDate(item.endedAt || item.startedAt || item.createdAt)}</div>
                  <h3 className="text-[15px] font-bold tracking-tight text-[#1C1917] mt-0.5">{item.topic?.name || 'IELTS Speaking'}</h3>
                  <p className="text-xs text-[#78716C] mt-1">
                    {studentNames || 'Học viên'} · {item.sessionMode === 'mentor' ? 'Phiên mentor' : 'Phiên peer'} · {item.notesCount} ghi chú
                  </p>
                </div>
                <span className={`shrink-0 text-[11.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                  getStudentWorkStatusClass(item) === 'success' ? 'text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0]'
                  : getStudentWorkStatusClass(item) === 'warning' ? 'text-[#B45309] bg-[#FEF6E7] border border-[#FCD9A5]'
                  : 'text-[#78716C] bg-[#F1EEEA] border border-[#EAE7E3]'
                }`}>
                  {getStudentWorkStatusLabel(item)}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                <span className="text-[11.5px] font-semibold text-[#57534E] bg-[#FAFAF8] border border-[#EAE7E3] px-2.5 py-[3px] rounded-md">{item.turnCount} lượt nói</span>
                <span className="text-[11.5px] font-semibold text-[#57534E] bg-[#FAFAF8] border border-[#EAE7E3] px-2.5 py-[3px] rounded-md">{item.overallBand ? `Band ${item.overallBand}` : 'Chưa có band AI'}</span>
                <span className="text-[11.5px] font-semibold text-[#57534E] bg-[#FAFAF8] border border-[#EAE7E3] px-2.5 py-[3px] rounded-md">{item.aiCompletedCount} kết quả AI</span>
              </div>

              {item.mentorReviewSummary && <p className="text-[13px] text-[#57534E] leading-relaxed mt-3">{item.mentorReviewSummary}</p>}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handleOpenStudentResult(item)}
                  disabled={openingSessionId === item.id}
                  className="h-10 px-3.5 rounded-lg border border-[#EAE7E3] text-[13px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] disabled:opacity-60"
                >
                  {openingSessionId === item.id ? 'Đang mở…' : 'Xem bài'}
                </button>
                <button
                  onClick={() => handlePublishStudentWork(item)}
                  disabled={publishingSessionId === item.id || isPublished || item.status !== 'completed'}
                  className="h-10 px-3.5 rounded-lg bg-[#D97757] text-white text-[13px] font-semibold hover:brightness-105 disabled:opacity-45 disabled:hover:brightness-100"
                >
                  {isPublished ? 'Đã public' : publishingSessionId === item.id ? 'Đang gửi…' : 'Xin đăng bài'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function TopicBuilderPanel() {
  const topicParts = [
    {
      part: 'Part 1',
      title: 'Câu hỏi ngắn',
      note: 'Giáo viên thêm nhiều câu hỏi ngắn xoay quanh cùng một chủ đề.',
      questions: [
        {
          text: 'Do you prefer studying alone or with other people?',
          vocabulary: [
            {
              phrase: 'study at my own pace',
              meaning: 'học theo tốc độ của bản thân',
              example: 'I prefer studying alone because I can study at my own pace.',
              notes: 'Dùng tốt cho Part 1.',
            },
            {
              phrase: 'exchange ideas',
              meaning: 'trao đổi ý tưởng',
              example: 'When I study with classmates, we can exchange ideas.',
              notes: 'Collocation tự nhiên.',
            },
          ],
        },
        {
          text: 'Who do you usually ask for advice when you study?',
          vocabulary: [
            {
              phrase: 'ask for guidance',
              meaning: 'xin sự hướng dẫn',
              example: 'I usually ask my teacher for guidance when I get stuck.',
              notes: 'Trang trọng hơn "ask for help".',
            },
          ],
        },
      ],
    },
    {
      part: 'Part 2',
      title: 'Cue card',
      note: 'Part 2 có một cue card chính, giáo viên thêm từ vựng riêng cho đúng bối cảnh nói dài.',
      questions: [
        {
          text: 'Describe a time when you learned something useful from another person.\nYou should say:\n- who that person was\n- what you learned\n- how you learned it\nand explain why it was useful for you.',
          vocabulary: [
            {
              phrase: 'what stood out to me was',
              meaning: 'điều khiến tôi ấn tượng là',
              example: 'What stood out to me was how patient she was.',
              notes: 'Cụm mở rộng ý tốt cho Part 2.',
            },
            {
              phrase: 'step-by-step guidance',
              meaning: 'hướng dẫn từng bước',
              example: 'He gave me step-by-step guidance until I understood the method.',
              notes: 'Nên dùng khi kể quá trình học.',
            },
          ],
        },
      ],
    },
    {
      part: 'Part 3',
      title: 'Thảo luận mở rộng',
      note: 'Part 3 cần câu hỏi có tính phân tích, so sánh hoặc đánh giá xã hội.',
      questions: [
        {
          text: 'Why do people learn better when they discuss with others?',
          vocabulary: [
            {
              phrase: 'broaden their perspective',
              meaning: 'mở rộng góc nhìn',
              example: 'Discussion helps learners broaden their perspective.',
              notes: 'Phù hợp câu trả lời phân tích.',
            },
            {
              phrase: 'constructive feedback',
              meaning: 'góp ý mang tính xây dựng',
              example: 'Constructive feedback can help students notice their weaknesses.',
              notes: 'Academic collocation.',
            },
          ],
        },
        {
          text: 'Do you think schools should encourage peer learning?',
          vocabulary: [
            {
              phrase: 'peer learning',
              meaning: 'học cùng bạn bè',
              example: 'Peer learning should be encouraged because it builds confidence.',
              notes: 'Keyword của câu hỏi.',
            },
          ],
        },
      ],
    },
  ];

  const existingTopics = [
    {
      name: 'Learning from other people',
      targetBand: 'Band 5.5 - 7.0',
      status: 'Đang mở',
      questionCount: 5,
      updatedAt: '01/06/2026',
    },
    {
      name: 'Education and technology',
      targetBand: 'Band 6.0 - 7.5',
      status: 'Nháp',
      questionCount: 6,
      updatedAt: '28/05/2026',
    },
    {
      name: 'Work and study',
      targetBand: 'Band 5.0 - 6.5',
      status: 'Đã ẩn',
      questionCount: 4,
      updatedAt: '22/05/2026',
    },
  ];

  return (
    <div className="workspace-panel">
      <section className="workspace-hero teacher-hero">
        <div>
          <div className="section-eyebrow">Giáo viên</div>
          <h2>Quản lý chủ đề luyện tập</h2>
          <p>Giáo viên xem danh sách chủ đề hiện có, thêm chủ đề mới, sửa nội dung câu hỏi hoặc xóa những chủ đề không còn dùng.</p>
        </div>
      </section>

      <section className="topic-manager-list">
        <div className="panel-heading">
          <h3>Danh sách chủ đề hiện có</h3>
          <span>{existingTopics.length} chủ đề</span>
        </div>

        <div className="topic-table">
          <div className="topic-table-head">
            <span>Chủ đề</span>
            <span>Mục tiêu band</span>
            <span>Số câu hỏi</span>
            <span>Trạng thái</span>
            <span>Thao tác</span>
          </div>

          {existingTopics.map((topic) => (
            <article className="topic-table-row" key={topic.name}>
              <div>
                <strong>{topic.name}</strong>
                <small>Cập nhật {topic.updatedAt}</small>
              </div>
              <span>{topic.targetBand}</span>
              <span>{topic.questionCount} câu</span>
              <span className={`status-pill ${topic.status === 'Đang mở' ? 'success' : topic.status === 'Nháp' ? 'warning' : ''}`}>
                {topic.status}
              </span>
              <div className="topic-row-actions">
                <Button variant="outline" size="sm">
                  <span className="material-symbols-rounded" style={{ fontSize: 14 }}>visibility</span>
                  Xem
                </Button>
                <Button variant="outline" size="sm">
                  <span className="material-symbols-rounded" style={{ fontSize: 14 }}>edit</span>
                  Sửa
                </Button>
                <Button variant="outline" size="sm">
                  <span className="material-symbols-rounded" style={{ fontSize: 14 }}>delete</span>
                  Xóa
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="topic-builder">
        <div className="panel-heading">
          <h3>Thêm hoặc chỉnh sửa chủ đề</h3>
          <span>Đang sửa: Learning from other people</span>
        </div>

        <div className="topic-form">
          <div className="topic-form-grid topic-general-grid">
            <div className="topic-field-group">
              <Label htmlFor="topic-name">Tên chủ đề</Label>
              <Input id="topic-name" value="Learning from other people" readOnly />
            </div>
            <div className="topic-field-group">
              <Label htmlFor="topic-level">Mục tiêu band</Label>
              <Input id="topic-level" value="Band 5.5 - 7.0" readOnly />
            </div>
          </div>

          <div className="topic-part-list">
            {topicParts.map((part) => (
              <section className="topic-part-card topic-part-editor" key={part.part}>
                <div className="topic-part-heading">
                  <div>
                    <span>{part.part}</span>
                    <strong>{part.title}</strong>
                    <p>{part.note}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    <span className="material-symbols-rounded" style={{ fontSize: 15 }}>add</span>
                    Thêm câu hỏi
                  </Button>
                </div>

                <div className="topic-question-editor-list">
                  {part.questions.map((question, questionIndex) => (
                    <article className="topic-question-editor" key={`${part.part}-${question.text}`}>
                      <div className="topic-question-top">
                        <div>
                          <span>Câu hỏi {questionIndex + 1}</span>
                          <Label htmlFor={`${part.part}-question-${questionIndex}`}>Nội dung câu hỏi</Label>
                        </div>
                        <Button variant="outline" size="sm">
                          <span className="material-symbols-rounded" style={{ fontSize: 15 }}>add</span>
                          Thêm từ gợi ý
                        </Button>
                      </div>

                      <textarea
                        id={`${part.part}-question-${questionIndex}`}
                        className="topic-question-textarea"
                        value={question.text}
                        readOnly
                      />

                      <div className="topic-vocab-table-wrap">
                        <table className="topic-vocab-table">
                          <thead>
                            <tr>
                              <th>Phrase</th>
                              <th>Vietnamese meaning</th>
                              <th>Example sentence</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {question.vocabulary.map((item) => (
                              <tr key={`${question.text}-${item.phrase}`}>
                                <td>{item.phrase}</td>
                                <td>{item.meaning}</td>
                                <td>{item.example}</td>
                                <td>{item.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <Button className="w-full">
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>add_circle</span>
            Lưu thay đổi chủ đề
          </Button>
        </div>
      </section>
    </div>
  );
}

function getTopicStatusLabel(status) {
  if (status === 'draft') return 'Nháp';
  if (status === 'hidden') return 'Đã ẩn';
  return 'Đang mở';
}

const BAND_RANGE_OPTIONS = [
  '4.0 - 5.0', '4.5 - 5.5', '5.0 - 6.0', '5.5 - 6.5',
  '6.0 - 7.0', '6.5 - 7.5', '7.0 - 8.0', '7.5 - 8.5', '8.0 - 9.0',
];

function getTopicStatusPill(status) {
  if (status === 'open') return 'text-[#047857] bg-[#D1FAE5] border-[#A7F3D0]';
  if (status === 'draft') return 'text-[#B45309] bg-[#FEF3C7] border-[#FDE68A]';
  return 'text-[#57534E] bg-[#F1EEEA] border-[#E7E5E4]';
}

function getEmptyQuestionDraft(partNumber = 1) {
  return {
    id: null,
    partNumber,
    questionText: '',
    cuePrompt: '',
    cueBullets: '',
    suggestedPhrases: '',
  };
}

function buildQuestionPayload(questionDraft) {
  const partNumber = Number(questionDraft.partNumber);
  const cueCard = partNumber === 2
    ? {
        prompt: questionDraft.cuePrompt,
        bulletPoints: questionDraft.cueBullets
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      }
    : null;

  return {
    partNumber,
    questionText: questionDraft.questionText,
    cueCard,
    suggestedPhrases: questionDraft.suggestedPhrases
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function TopicBuilderPanelReal() {
  const [topics, setTopics] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [topicDetail, setTopicDetail] = useState(null);
  const [topicForm, setTopicForm] = useState({ name: '', targetBand: '', status: 'open' });
  const [questionDraft, setQuestionDraft] = useState(getEmptyQuestionDraft());
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [topicModalMode, setTopicModalMode] = useState('edit');
  const [loadStatus, setLoadStatus] = useState('idle');
  const [detailStatus, setDetailStatus] = useState('idle');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isEditingQuestion = Boolean(questionDraft.id);

  async function loadTopics(shouldKeepSelection = true) {
    setLoadStatus('loading');
    setError('');

    try {
      const data = await getTopics(getIdentity()?.userId);
      const nextTopics = data.topics || [];
      const nextSelectedId = shouldKeepSelection && selectedTopicId
        ? selectedTopicId
        : nextTopics[0]?.id || '';

      setTopics(nextTopics);
      setSelectedTopicId(nextSelectedId);
      setLoadStatus('success');
      return nextSelectedId;
    } catch (err) {
      setLoadStatus('error');
      setError(err.message);
      return '';
    }
  }

  async function loadTopicDetail(topicId) {
    if (!topicId) {
      setTopicDetail(null);
      setTopicForm({ name: '', targetBand: '', status: 'open' });
      return;
    }

    setDetailStatus('loading');
    setError('');

    try {
      const data = await getTopicDetail(topicId);
      setTopicDetail(data);
      setTopicForm({
        name: data.topic.name || '',
        targetBand: data.topic.targetBand || '',
        status: data.topic.status || 'open',
      });
      setQuestionDraft(getEmptyQuestionDraft());
      setDetailStatus('success');
    } catch (err) {
      setDetailStatus('error');
      setError(err.message);
    }
  }

  useEffect(() => {
    loadTopics(false);
  }, []);

  useEffect(() => {
    loadTopicDetail(selectedTopicId);
  }, [selectedTopicId]);

  async function refreshAfterMutation(topicId = selectedTopicId) {
    await loadTopics(true);
    await loadTopicDetail(topicId);
  }

  async function handleCreateTopic() {
    setSaveStatus('saving');
    setMessage('');
    setError('');

    try {
      const identity = getIdentity();
      const result = await createTopic({
        ...topicForm,
        ownerId: identity?.userId,
        actorUserId: identity?.userId,
        scope: identity?.userRole === 'admin' ? 'system' : 'mentor_private',
      });
      await loadTopics(true);
      setSelectedTopicId(result.topic.id);
      setTopicModalOpen(false);
      setMessage('Đã tạo bộ câu hỏi mới.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaveStatus('idle');
    }
  }

  async function handleUpdateTopic() {
    if (!selectedTopicId) return;

    setSaveStatus('saving');
    setMessage('');
    setError('');

    try {
      await updateTopic(selectedTopicId, {
        ...topicForm,
        actorUserId: getIdentity()?.userId,
      });
      await refreshAfterMutation(selectedTopicId);
      setTopicModalOpen(false);
      setMessage('Đã lưu thay đổi bộ câu hỏi.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaveStatus('idle');
    }
  }

  async function handleDeleteTopic(topicId) {
    if (!window.confirm('Xóa bộ câu hỏi này? Bộ đã được dùng trong phiên luyện sẽ không thể xóa.')) {
      return;
    }

    setSaveStatus('saving');
    setMessage('');
    setError('');

    try {
      await deleteTopic(topicId, getIdentity()?.userId);
      if (topicId === selectedTopicId) {
        setSelectedTopicId('');
      }
      await loadTopics(true);
      setMessage('Đã xóa bộ câu hỏi.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaveStatus('idle');
    }
  }

  function openCreateTopicModal() {
    setError('');
    setMessage('');
    setTopicForm({ name: '', targetBand: '', status: 'open' });
    setTopicModalMode('create');
    setTopicModalOpen(true);
  }

  function openEditTopicModal() {
    setError('');
    setMessage('');
    if (topicDetail?.topic) {
      setTopicForm({
        name: topicDetail.topic.name || '',
        targetBand: topicDetail.topic.targetBand || '',
        status: topicDetail.topic.status || 'open',
      });
    }
    setTopicModalMode('edit');
    setTopicModalOpen(true);
  }

  async function handleSaveQuestion() {
    if (!selectedTopicId) return;

    setSaveStatus('saving');
    setMessage('');
    setError('');

    try {
      const payload = {
        ...buildQuestionPayload(questionDraft),
        actorUserId: getIdentity()?.userId,
      };

      if (questionDraft.id) {
        await updateQuestion(questionDraft.id, payload);
      } else {
        await createQuestion(selectedTopicId, payload);
      }

      await refreshAfterMutation(selectedTopicId);
      setQuestionDraft(getEmptyQuestionDraft(payload.partNumber));
      setQuestionModalOpen(false);
      setMessage(questionDraft.id ? 'Đã cập nhật câu hỏi.' : 'Đã thêm câu hỏi.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaveStatus('idle');
    }
  }

  async function handleDeleteQuestion(questionId) {
    if (!window.confirm('Xóa câu hỏi này? Câu hỏi đã nằm trong phiên luyện sẽ không thể xóa.')) {
      return;
    }

    setSaveStatus('saving');
    setMessage('');
    setError('');

    try {
      await deleteQuestion(questionId, getIdentity()?.userId);
      await refreshAfterMutation(selectedTopicId);
      setMessage('Đã xóa câu hỏi.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaveStatus('idle');
    }
  }

  function startEditQuestion(question) {
    setError('');
    setMessage('');
    setQuestionDraft({
      id: question.id,
      partNumber: question.partNumber,
      questionText: question.questionText || '',
      cuePrompt: question.cueCard?.prompt || '',
      cueBullets: (question.cueCard?.bullet_points || question.cueCard?.bulletPoints || []).join('\n'),
      suggestedPhrases: (question.suggestedPhrases || []).join('\n'),
    });
    setQuestionModalOpen(true);
  }

  function startAddQuestion(partNumber = 1) {
    setError('');
    setMessage('');
    setQuestionDraft(getEmptyQuestionDraft(partNumber));
    setQuestionModalOpen(true);
  }

  const groupedQuestions = [1, 2, 3].map((partNumber) => ({
    partNumber,
    questions: (topicDetail?.questions || []).filter((question) => question.partNumber === partNumber),
  }));

  // Shared templates (owner_id = null) are read-only; only own sets can be edited.
  const canEditDetail = (topicDetail?.topic?.ownerId ?? null) !== null;

  const inputClass = 'w-full h-11 px-3.5 rounded-xl border border-[#EAE7E3] text-sm focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]';
  const textareaClass = 'w-full px-3.5 py-2.5 rounded-xl border border-[#EAE7E3] text-sm leading-relaxed resize-y focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]';
  const labelClass = 'block text-[13px] font-semibold text-[#1C1917] mb-1.5';
  const selectedTopic = topics.find((t) => t.id === selectedTopicId);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#D97757] font-bold">Nội dung luyện tập</div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1C1917] mt-1">Quản lý bộ câu hỏi</h1>
        <p className="text-sm text-[#78716C] mt-1">Danh sách các bộ câu hỏi IELTS Speaking của bạn. Bấm vào một bộ để xem và chỉnh sửa các câu hỏi bên trong.</p>
      </div>

      {(message || error) && (
        <div className={`mb-4 text-sm rounded-xl px-4 py-2.5 border ${error ? 'text-red-700 bg-red-50 border-red-200' : 'text-[#065F46] bg-[#ECFDF5] border-[#A7F3D0]'}`}>
          {error || message}
        </div>
      )}

      {/* --- List view: all question sets --- */}
      {!selectedTopicId && (
      <section className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1EEEA]">
          <div>
            <h3 className="font-bold text-[#1C1917]">Danh sách bộ câu hỏi</h3>
            <p className="text-xs text-[#78716C] mt-0.5">{loadStatus === 'loading' ? 'Đang tải...' : `${topics.length} bộ câu hỏi`}</p>
          </div>
          <button
            onClick={openCreateTopicModal}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold bg-[#D97757] text-white shadow-[0_4px_12px_-2px_rgba(217,119,87,.4)] hover:brightness-105"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
            Tạo bộ mới
          </button>
        </div>

        <div className="divide-y divide-[#F1EEEA]">
          {topics.map((topic) => {
            const isActive = topic.id === selectedTopicId;
            return (
              <article key={topic.id} className={`flex items-center gap-4 px-5 py-3.5 ${isActive ? 'bg-[#FBF4EF]' : 'hover:bg-[#FAFAF8]'}`}>
                <button type="button" onClick={() => setSelectedTopicId(topic.id)} className="flex-1 min-w-0 text-left flex items-center gap-2.5">
                  <span className={`material-symbols-rounded shrink-0 transition-colors ${isActive ? 'text-[#D97757]' : 'text-[#C7C2BC]'}`} style={{ fontSize: 20 }}>
                    {isActive ? 'expand_more' : 'chevron_right'}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <strong className="text-[15px] font-bold text-[#1C1917] truncate">{topic.name}</strong>
                      {topic.ownerId === null && (
                        <span className="shrink-0 text-[10.5px] font-bold text-[#57534E] bg-[#F1EEEA] border border-[#E7E5E4] px-1.5 py-[1px] rounded">mẫu chung</span>
                      )}
                    </span>
                    <span className="block text-xs text-[#78716C] mt-0.5">
                      Part 1: {topic.partCounts.part1} · Part 2: {topic.partCounts.part2} · Part 3: {topic.partCounts.part3}
                      <span className="text-[#D6D3D1]"> · </span>{topic.questionCount} câu
                      {topic.targetBand ? <><span className="text-[#D6D3D1]"> · </span>{topic.targetBand}</> : null}
                    </span>
                  </span>
                </button>
                <span className={`shrink-0 inline-flex items-center justify-center text-center text-[11.5px] font-bold px-3 py-1 rounded-full border ${getTopicStatusPill(topic.status)}`}>
                  {getTopicStatusLabel(topic.status)}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {topic.ownerId !== null && (
                    <button
                      onClick={() => handleDeleteTopic(topic.id)}
                      disabled={saveStatus === 'saving'}
                      className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#EAE7E3] text-[#78716C] hover:border-red-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-60"
                      aria-label="Xóa bộ câu hỏi"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 18 }}>delete</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {loadStatus !== 'loading' && topics.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-[#78716C]">Bạn chưa có bộ câu hỏi nào. Bấm “Tạo bộ mới” để bắt đầu.</div>
          )}
        </div>
      </section>
      )}

      {/* --- Detail view: the selected set's questions --- */}
      {selectedTopicId && (
      <>
      <button onClick={() => setSelectedTopicId('')} className="inline-flex items-center gap-1.5 h-10 px-4 mb-4 rounded-xl border border-[#EAE7E3] bg-white text-[13.5px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] hover:bg-[#FBF4EF] transition-colors">
        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_back</span>
        Danh sách bộ câu hỏi
      </button>
      <section className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F1EEEA]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-extrabold tracking-tight text-[#1C1917] truncate">{topicDetail?.topic?.name || selectedTopic?.name || 'Bộ câu hỏi'}</h3>
              <span className={`shrink-0 inline-flex items-center justify-center text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getTopicStatusPill(topicDetail?.topic?.status || 'open')}`}>
                {getTopicStatusLabel(topicDetail?.topic?.status || 'open')}
              </span>
            </div>
            <p className="text-xs text-[#78716C] mt-0.5">
              {topicDetail?.topic?.targetBand ? `Mục tiêu ${topicDetail.topic.targetBand} · ` : ''}{topicDetail?.topic?.questionCount ?? 0} câu hỏi
            </p>
          </div>
          {topicDetail?.topic?.ownerId !== null && (
            <button onClick={openEditTopicModal} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#D97757] text-white text-[13.5px] font-semibold hover:brightness-105 shadow-[0_4px_12px_-2px_rgba(217,119,87,.4)]">
              <span className="material-symbols-rounded" style={{ fontSize: 18 }}>edit</span>
              Chỉnh sửa
            </button>
          )}
        </div>

        <div className="p-5">
          {topicDetail?.topic?.ownerId === null && (
            <div className="mb-4 text-[13px] text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9] rounded-xl px-4 py-2.5">
              Đây là bộ mẫu chung — bạn có thể dùng nhưng không chỉnh sửa. Hãy tạo bộ của riêng mình để tùy biến.
            </div>
          )}
          <div>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-[15px] font-bold text-[#1C1917]">Câu hỏi trong bộ</h4>
                  <p className="text-xs text-[#78716C] mt-0.5">{canEditDetail ? 'Bấm “Sửa” trên một câu để mở cửa sổ chỉnh sửa.' : 'Bộ mẫu chung chỉ để xem.'}</p>
                </div>
                {canEditDetail && (
                  <button onClick={() => startAddQuestion(1)}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105 shadow-[0_4px_12px_-2px_rgba(217,119,87,.4)]">
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
                    Thêm câu hỏi
                  </button>
                )}
              </div>

              {/* Questions grouped by part */}
              <div className="flex flex-col gap-4">
                {groupedQuestions.map((group) => (
                  <section key={group.partNumber}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-baseline gap-2">
                        <h4 className="text-[13px] font-bold text-[#1C1917]">Part {group.partNumber}</h4>
                        <span className="text-xs text-[#78716C]">{group.questions.length} câu · {group.partNumber === 2 ? 'cue card & câu nói dài' : 'câu hỏi theo lượt'}</span>
                      </div>
                      {canEditDetail && (
                        <button onClick={() => startAddQuestion(group.partNumber)}
                          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-[#EAE7E3] text-[12.5px] font-semibold text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] hover:bg-[#FBF4EF]">
                          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>add</span>
                          Thêm
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {group.questions.map((question) => (
                        <article key={question.id} className="bg-white border border-[#EAE7E3] rounded-xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className={`text-[10.5px] font-bold px-1.5 py-[1px] rounded ${question.usedInTurnCount > 0 ? 'text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9]' : 'text-[#57534E] bg-[#F1EEEA]'}`}>
                                {question.usedInTurnCount > 0 ? 'Đã dùng trong phiên' : 'Chưa dùng'}
                              </span>
                              <p className="text-sm font-semibold text-[#1C1917] mt-1.5">{question.questionText}</p>
                              {question.cueCard?.prompt && <p className="text-xs text-[#78716C] mt-1">Cue: {question.cueCard.prompt}</p>}
                              {(question.suggestedPhrases || []).length > 0 && (
                                <p className="text-xs text-[#A8A29E] mt-1">Phrase: {question.suggestedPhrases.join(', ')}</p>
                              )}
                            </div>
                            {canEditDetail && (
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => startEditQuestion(question)}
                                  className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#EAE7E3] text-[#57534E] hover:border-[#EAC7B9] hover:text-[#8A4A33] hover:bg-[#FBF4EF]" aria-label="Sửa câu hỏi">
                                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>edit</span>
                                </button>
                                <button onClick={() => handleDeleteQuestion(question.id)} disabled={saveStatus === 'saving'}
                                  className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#EAE7E3] text-[#78716C] hover:border-red-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-60" aria-label="Xóa câu hỏi">
                                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </article>
                      ))}

                      {group.questions.length === 0 && (
                        canEditDetail ? (
                          <button onClick={() => startAddQuestion(group.partNumber)}
                            className="w-full border border-dashed border-[#E7E5E4] rounded-xl px-4 py-5 text-center hover:border-[#EAC7B9] hover:bg-[#FBF4EF] transition-colors">
                            <p className="text-sm font-semibold text-[#78716C]">Chưa có câu hỏi Part {group.partNumber}</p>
                            <p className="text-xs text-[#A8A29E] mt-0.5">Bấm để thêm câu hỏi cho phần này.</p>
                          </button>
                        ) : (
                          <div className="border border-dashed border-[#E7E5E4] rounded-xl px-4 py-5 text-center">
                            <p className="text-sm font-semibold text-[#78716C]">Chưa có câu hỏi Part {group.partNumber}</p>
                          </div>
                        )
                      )}
                    </div>
                  </section>
                ))}
              </div>
          </div>
        </div>
      </section>
      </>
      )}

      {/* Question editor modal (add / edit a single question) */}
      {questionModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-5"
          onClick={(e) => { if (e.target === e.currentTarget) setQuestionModalOpen(false); }}>
          <div className="w-full max-w-2xl bg-white border border-[#EAE7E3] rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1EEEA]">
              <div>
                <div className="text-[11px] uppercase tracking-wide font-bold text-[#D97757]">{isEditingQuestion ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi'}</div>
                <h3 className="font-bold text-[#1C1917]">{selectedTopic?.name || 'Bộ câu hỏi'}</h3>
              </div>
              <button onClick={() => setQuestionModalOpen(false)}
                className="w-9 h-9 grid place-items-center rounded-lg border border-[#EAE7E3] text-[#78716C] hover:bg-[#F1EEEA]" aria-label="Đóng">
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div>
                <label htmlFor="question-part" className={labelClass}>Part</label>
                <select id="question-part" className={inputClass} value={questionDraft.partNumber}
                  onChange={(e) => setQuestionDraft((current) => ({ ...current, partNumber: Number(e.target.value) }))}>
                  <option value={1}>Part 1</option>
                  <option value={2}>Part 2</option>
                  <option value={3}>Part 3</option>
                </select>
              </div>

              <div className="mt-4">
                <label htmlFor="question-text" className={labelClass}>Câu hỏi</label>
                <textarea id="question-text" rows={4} className={textareaClass} value={questionDraft.questionText}
                  onChange={(e) => setQuestionDraft((current) => ({ ...current, questionText: e.target.value }))} />
              </div>

              <div className="mt-4">
                <label htmlFor="question-phrases" className={labelClass}>Cụm từ gợi ý <span className="text-[#A8A29E] font-normal">(mỗi dòng một phrase)</span></label>
                <textarea id="question-phrases" rows={4} className={textareaClass} value={questionDraft.suggestedPhrases}
                  placeholder="Mỗi dòng là một phrase"
                  onChange={(e) => setQuestionDraft((current) => ({ ...current, suggestedPhrases: e.target.value }))} />
              </div>

              {Number(questionDraft.partNumber) === 2 && (
                <div className="mt-4 grid gap-4">
                  <div>
                    <label htmlFor="cue-prompt" className={labelClass}>Cue card prompt</label>
                    <textarea id="cue-prompt" rows={3} className={textareaClass} value={questionDraft.cuePrompt}
                      onChange={(e) => setQuestionDraft((current) => ({ ...current, cuePrompt: e.target.value }))} />
                  </div>
                  <div>
                    <label htmlFor="cue-bullets" className={labelClass}>Cue card bullet points <span className="text-[#A8A29E] font-normal">(mỗi dòng một bullet)</span></label>
                    <textarea id="cue-bullets" rows={4} className={textareaClass} value={questionDraft.cueBullets}
                      placeholder="Mỗi dòng là một bullet"
                      onChange={(e) => setQuestionDraft((current) => ({ ...current, cueBullets: e.target.value }))} />
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            </div>

            <div className="px-5 py-4 border-t border-[#F1EEEA] flex justify-end gap-2">
              <button onClick={() => setQuestionModalOpen(false)}
                className="h-11 px-5 rounded-xl border border-[#EAE7E3] text-sm font-semibold text-[#57534E] hover:bg-[#F1EEEA]">
                Hủy
              </button>
              <button onClick={handleSaveQuestion} disabled={saveStatus === 'saving'}
                className="inline-flex items-center gap-1.5 h-11 px-6 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105 disabled:opacity-60">
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>{isEditingQuestion ? 'save' : 'add'}</span>
                {isEditingQuestion ? 'Lưu câu hỏi' : 'Thêm câu hỏi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topic info modal (create / edit set info) */}
      {topicModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-5"
          onClick={(e) => { if (e.target === e.currentTarget) setTopicModalOpen(false); }}>
          <div className="w-full max-w-lg bg-white border border-[#EAE7E3] rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1EEEA]">
              <h3 className="font-bold text-[#1C1917]">{topicModalMode === 'create' ? 'Tạo bộ câu hỏi mới' : 'Chỉnh sửa thông tin bộ'}</h3>
              <button onClick={() => setTopicModalOpen(false)}
                className="w-9 h-9 grid place-items-center rounded-lg border border-[#EAE7E3] text-[#78716C] hover:bg-[#F1EEEA]" aria-label="Đóng">
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div>
                <label htmlFor="topic-modal-name" className={labelClass}>Tên bộ câu hỏi</label>
                <input id="topic-modal-name" className={inputClass} value={topicForm.name} maxLength={100} autoFocus
                  onChange={(e) => setTopicForm((current) => ({ ...current, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="topic-modal-band" className={labelClass}>Phạm vi band mục tiêu</label>
                  <select id="topic-modal-band" className={inputClass} value={topicForm.targetBand || ''}
                    onChange={(e) => setTopicForm((current) => ({ ...current, targetBand: e.target.value }))}>
                    <option value="">Chưa đặt</option>
                    {topicForm.targetBand && !BAND_RANGE_OPTIONS.includes(topicForm.targetBand) && (
                      <option value={topicForm.targetBand}>{topicForm.targetBand}</option>
                    )}
                    {BAND_RANGE_OPTIONS.map((range) => (
                      <option key={range} value={range}>Band {range}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="topic-modal-status" className={labelClass}>Trạng thái</label>
                  <select id="topic-modal-status" className={inputClass} value={topicForm.status}
                    onChange={(e) => setTopicForm((current) => ({ ...current, status: e.target.value }))}>
                    <option value="open">Đang mở</option>
                    <option value="draft">Nháp</option>
                    <option value="hidden">Đã ẩn</option>
                  </select>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="px-5 py-4 border-t border-[#F1EEEA] flex justify-end gap-2">
              <button onClick={() => setTopicModalOpen(false)}
                className="h-11 px-5 rounded-xl border border-[#EAE7E3] text-sm font-semibold text-[#57534E] hover:bg-[#F1EEEA]">
                Hủy
              </button>
              <button onClick={topicModalMode === 'create' ? handleCreateTopic : handleUpdateTopic} disabled={saveStatus === 'saving'}
                className="inline-flex items-center gap-1.5 h-11 px-6 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105 disabled:opacity-60">
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>{topicModalMode === 'create' ? 'add' : 'save'}</span>
                {topicModalMode === 'create' ? 'Tạo bộ' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfilePanel() {
  return (
    <div className="profile-layout">
      <Card className="profile-card">
        <CardContent className="p-6">
          <div className="profile-cover" />
          <div className="profile-avatar">YS</div>
          <h2>Học viên Try Your Speech</h2>
          <p>Band hiện tại: 5.0 · Mục tiêu: 6.5</p>
          <div className="profile-actions">
            <Button size="sm">
              <span className="material-symbols-rounded" style={{ fontSize: 15 }}>edit</span>
              Chỉnh sửa hồ sơ
            </Button>
            <Button variant="outline" size="sm">
              <span className="material-symbols-rounded" style={{ fontSize: 15 }}>settings</span>
              Cài đặt
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="profile-summary">
        {[
          ['12', 'Phiên luyện đã tham gia'],
          ['34', 'Ghi chú lỗi đã tạo'],
          ['5.5', 'Band mục tiêu gần nhất'],
        ].map(([value, label]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <strong>{value}</strong>
              <span>{label}</span>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="p-6">
          <h3 className="text-base font-semibold text-zinc-900 mb-4">Kế hoạch luyện tập</h3>
          <div className="profile-plan">
            <div><span className="material-symbols-rounded">check_circle</span> Hoàn thành 3 phiên Part 1 trong tuần</div>
            <div><span className="material-symbols-rounded">radio_button_unchecked</span> Luyện cue card về Education</div>
            <div><span className="material-symbols-rounded">radio_button_unchecked</span> Review lại ghi chú pronunciation</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatProfileDate(value) {
  if (!value) return 'Chưa có dữ liệu';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function getInitials(name) {
  if (!name) return 'YS';

  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase()).join('') || 'YS';
}

function formatBand(value) {
  if (value === null || value === undefined || value === '') {
    return 'Chưa có';
  }

  return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : 'Chưa có';
}

function ProfilePanelReal() {
  const { state, dispatch } = useSession();
  const currentUserId = state.userId || getStoredCurrentUserId();
  const [profile, setProfile] = useState(null);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [bandDraft, setBandDraft] = useState(5);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!currentUserId) {
      setProfile(null);
      setLoadStatus('idle');
      return undefined;
    }

    let cancelled = false;

    async function loadProfile() {
      setLoadStatus('loading');
      setLoadError('');

      try {
        const data = await getUserProfile(currentUserId);
        if (!cancelled) {
          setProfile(data);
          setDisplayNameDraft(data.user.displayName || '');
          setBandDraft(data.user.band ?? 5);
          setLoadStatus('loaded');
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message);
          setLoadStatus('error');
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, reloadKey]);

  async function handleSaveProfile() {
    if (!currentUserId) return;

    setSaveStatus('saving');
    setSaveError('');

    try {
      const updatedProfile = await updateUserProfile(currentUserId, {
        displayName: displayNameDraft,
        band: Number(bandDraft),
      });

      setProfile(updatedProfile);
      dispatch({
        type: 'SET_USER',
        payload: {
          userId: currentUserId,
          displayName: updatedProfile.user.displayName,
          band: updatedProfile.user.band,
        },
      });
      setIsEditing(false);
      setSaveStatus('saved');
    } catch (err) {
      setSaveError(err.message);
      setSaveStatus('error');
    }
  }

  if (!currentUserId) {
    return (
      <div className="max-w-md mx-auto mt-8 bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 rounded-2xl grid place-items-center text-white font-bold text-xl bg-[#D97757] mx-auto mb-4">YS</div>
        <h2 className="text-lg font-bold text-[#1C1917]">Chưa có hồ sơ hiện tại</h2>
        <p className="text-sm text-[#78716C] mt-1.5">Hãy tham gia một phiên luyện tập để hệ thống tạo hồ sơ cho bạn.</p>
      </div>
    );
  }

  if (loadStatus === 'loading') {
    return (
      <div className="max-w-md mx-auto mt-8 bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-8 text-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#EAE7E3] border-t-[#D97757] animate-spin mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#1C1917]">Đang tải hồ sơ</h2>
        <p className="text-sm text-[#78716C] mt-1.5">Hệ thống đang lấy thông tin hồ sơ từ máy chủ.</p>
      </div>
    );
  }

  if (loadStatus === 'error') {
    return (
      <div className="max-w-md mx-auto mt-8 bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 rounded-2xl grid place-items-center text-white font-bold text-2xl bg-red-500 mx-auto mb-4">!</div>
        <h2 className="text-lg font-bold text-[#1C1917]">Không tải được hồ sơ</h2>
        <p className="text-sm text-[#78716C] mt-1.5">{loadError}</p>
        <button onClick={() => setReloadKey((key) => key + 1)}
          className="inline-flex items-center gap-1.5 h-10 px-5 mt-4 rounded-xl border border-[#EAE7E3] text-sm font-semibold text-[#57534E] hover:bg-[#F1EEEA]">
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>refresh</span>
          Thử lại
        </button>
      </div>
    );
  }

  const user = profile?.user || {};
  const stats = profile?.stats || {};
  const isMentorUser = user.userRole === 'mentor';
  const summaryItems = isMentorUser
    ? [
        [stats.totalSessions ?? 0, 'Số phiên đã tham gia', 'groups', '#2563EB'],
        [stats.completedSessions ?? 0, 'Số phiên hoàn thành', 'task_alt', '#059669'],
        [stats.mentorSessionsCreated ?? 0, 'Số phiên học đã tạo', 'co_present', '#D97757'],
        [stats.publishedPostsCount ?? 0, 'Số bài nói đã public', 'campaign', '#7C3AED'],
        [stats.likesReceivedCount ?? 0, 'Lượt thích nhận được', 'favorite', '#DB2777'],
        [stats.mentorReviewsCount ?? 0, 'Nhận xét đã gửi', 'rate_review', '#B45309'],
      ]
    : [
        [stats.totalSessions ?? 0, 'Số phiên đã tham gia', 'groups', '#2563EB'],
        [stats.completedSessions ?? 0, 'Số phiên hoàn thành', 'task_alt', '#059669'],
        [formatBand(stats.latestEstimatedBand), 'Band ước tính gần nhất', 'trending_up', '#D97757'],
        [stats.publishedPostsCount ?? 0, 'Số bài nói đã public', 'campaign', '#7C3AED'],
        [stats.likesReceivedCount ?? 0, 'Lượt thích nhận được', 'favorite', '#DB2777'],
        [stats.notesGivenCount ?? 0, 'Ghi chú lỗi đã tạo', 'edit_note', '#B45309'],
      ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Profile header */}
      <div className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm overflow-hidden mb-5">
        <div className="h-20 bg-[#D97757]" />
        <div className="px-6 pb-6 -mt-10 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl grid place-items-center text-white font-bold text-2xl bg-[#D97757] border-4 border-white shadow-md">
            {getInitials(user.displayName)}
          </div>

          {!isEditing ? (
            <>
              <h2 className="text-xl font-extrabold tracking-tight text-[#1C1917] mt-3">{user.displayName || 'Người dùng Try Your Speech'}</h2>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-[12px] font-bold px-2.5 py-1 rounded-full text-[#8A4A33] bg-[#F7ECE6] border border-[#EAC7B9]">
                  {isMentorUser ? 'Giáo viên' : 'Học viên'}
                </span>
                <span className="text-[12px] font-bold px-2.5 py-1 rounded-full text-[#57534E] bg-[#F1EEEA] border border-[#E7E5E4] tabular-nums">
                  Band {formatBand(user.band)}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2 mt-4">
                <button onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105 shadow-[0_4px_12px_-2px_rgba(217,119,87,.4)]">
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>edit</span>
                  Chỉnh sửa hồ sơ
                </button>
                <button onClick={() => setReloadKey((key) => key + 1)}
                  className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-[#EAE7E3] text-sm font-semibold text-[#57534E] hover:bg-[#F1EEEA]">
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>refresh</span>
                  Tải lại
                </button>
              </div>
            </>
          ) : (
            <div className="w-full max-w-sm mt-4 text-left">
              <label htmlFor="profile-display-name" className="block text-[13px] font-semibold text-[#1C1917] mb-1.5">Tên hiển thị</label>
              <input id="profile-display-name" value={displayNameDraft} maxLength={100}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-[#EAE7E3] text-sm focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]" />

              <div className="flex items-center justify-between mt-4 mb-1.5">
                <label htmlFor="profile-band" className="text-[13px] font-semibold text-[#1C1917]">Band hiện tại</label>
                <span className="text-sm font-bold text-[#D97757] tabular-nums">{formatBand(bandDraft)}</span>
              </div>
              <input id="profile-band" type="range" min={0} max={9} step={0.5} value={bandDraft}
                onChange={(e) => setBandDraft(Number(e.target.value))} className="w-full accent-[#D97757]" />

              {saveError && <p className="text-sm text-red-600 mt-3">{saveError}</p>}
              <div className="flex items-center gap-2 mt-5">
                <button onClick={handleSaveProfile} disabled={saveStatus === 'saving'}
                  className="inline-flex items-center gap-1.5 h-11 px-6 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105 disabled:opacity-60">
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>save</span>
                  {saveStatus === 'saving' ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
                <button onClick={() => {
                    setDisplayNameDraft(user.displayName || '');
                    setBandDraft(user.band ?? 5);
                    setIsEditing(false);
                    setSaveError('');
                  }}
                  className="h-11 px-5 rounded-xl border border-[#EAE7E3] text-sm font-semibold text-[#57534E] hover:bg-[#F1EEEA]">
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mb-5">
        {summaryItems.map(([value, label, icon, color]) => (
          <div key={label} className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-4 flex flex-col items-center text-center">
            <span className="material-symbols-rounded mb-1.5" style={{ fontSize: 22, color }}>{icon}</span>
            <strong className="text-2xl font-extrabold tracking-tight text-[#1C1917] tabular-nums leading-none">{value}</strong>
            <span className="text-[12px] font-medium text-[#78716C] mt-1.5 leading-snug">{label}</span>
          </div>
        ))}
      </div>

      {/* Overview */}
      <div className="bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-6">
        <h3 className="text-base font-bold text-[#1C1917] mb-4">Tổng quan luyện tập</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-[#F1EEEA] bg-[#FAFAF8] px-3.5 py-3">
            <span className="material-symbols-rounded text-[#2563EB]" style={{ fontSize: 20 }}>groups</span>
            <div><div className="text-[11px] text-[#78716C]">Phiên peer</div><div className="text-sm font-bold text-[#1C1917] tabular-nums">{stats.peerSessions ?? 0}</div></div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-[#F1EEEA] bg-[#FAFAF8] px-3.5 py-3">
            <span className="material-symbols-rounded text-[#D97757]" style={{ fontSize: 20 }}>school</span>
            <div><div className="text-[11px] text-[#78716C]">Phiên mentor</div><div className="text-sm font-bold text-[#1C1917] tabular-nums">{stats.mentorSessions ?? 0}</div></div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-[#F1EEEA] bg-[#FAFAF8] px-3.5 py-3">
            <span className="material-symbols-rounded text-[#059669]" style={{ fontSize: 20 }}>event</span>
            <div><div className="text-[11px] text-[#78716C]">Lần luyện gần nhất</div><div className="text-sm font-bold text-[#1C1917]">{formatProfileDate(stats.lastPracticedAt)}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LobbyPage() {
  const [activeTab, setActiveTab] = useState('practice');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [band, setBand] = useState(5);
  const [nameError, setNameError] = useState('');
  const { state, dispatch, refs } = useSession();
  const { findMatch, cancelMatch } = useSocket();
  const navigate = useNavigate();

  const isSearching = state.phase === 'searching';
  const isMatched = state.phase === 'matched';

  useEffect(() => {
    if (!isSearching && !isMatched) {
      cleanupMediaSession(refs);
    }
  }, [isSearching, isMatched, refs]);

  useEffect(() => {
    if (isMatched) {
      navigate('/device-check');
    }
  }, [isMatched, navigate]);

  function handleSubmit(e) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setNameError('Vui lòng nhập tên hiển thị');
      return;
    }
    if (name.length > 100) {
      setNameError('Tên không được vượt quá 100 ký tự');
      return;
    }
    setNameError('');
    findMatch(name, band);
  }

  if (state.error?.type === 'match_error') {
    return (
      <ErrorScreen
        icon="group_off"
        title="Không thể tìm đối tác"
        description={state.error.message}
        actions={
          <Button
            onClick={() => {
              dispatch({ type: 'CLEAR_ERROR' });
              dispatch({ type: 'SET_PHASE', payload: 'lobby' });
            }}
          >
            Thử lại
          </Button>
        }
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeTab={activeTab}
        onChangeTab={(key) => { setActiveTab(key); setSidebarOpen(false); }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      {sidebarOpen && (
        <div className="app-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <main className={`app-main ${activeTab === 'practice' ? 'app-main-practice' : ''}`}>
        <div className="app-mobile-bar">
          <button
            type="button"
            className="app-mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Mở menu"
          >
            <span className="material-symbols-rounded">menu</span>
          </button>
          <span className="app-mobile-title">
            {activeTab === 'profile' ? 'Hồ sơ' : NAV_ITEMS.find((item) => item.key === activeTab)?.label}
          </span>
        </div>

        {activeTab !== 'practice' && (
          <header className="app-topbar">
            <div>
              <div className="section-eyebrow">Không gian học tập</div>
              <h2>{activeTab === 'profile' ? 'Quản lý thông tin cá nhân' : NAV_ITEMS.find((item) => item.key === activeTab)?.label}</h2>
            </div>
          </header>
        )}

        {activeTab === 'practice' && (
          <PracticePanel
            displayName={displayName}
            setDisplayName={setDisplayName}
            band={band}
            setBand={setBand}
            nameError={nameError}
            setNameError={setNameError}
            isSearching={isSearching}
            onSubmit={handleSubmit}
            onCancel={cancelMatch}
          />
        )}
        {activeTab === 'mentorLearner' && <MentorLearnerPage embedded />}
        {activeTab === 'mentorHost' && <MentorHostPage embedded />}
        {activeTab === 'classroom' && <ClassroomPanelReal />}
        {activeTab === 'history' && <UserHistoryPanelReal />}
        {activeTab === 'notifications' && <NotificationsPanelReal />}
        {activeTab === 'teacherReviews' && <TeacherReviewsPanelReal />}
        {activeTab === 'topicBuilder' && <TopicBuilderPanelReal />}
        {activeTab === 'profile' && <ProfilePanelReal />}
      </main>
    </div>
  );
}
