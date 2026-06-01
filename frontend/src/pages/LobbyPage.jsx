import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useSession } from '../context/SessionContext';
import { ErrorScreen } from '../components/ui/ErrorScreen';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { cleanupMediaSession } from '../utils/mediaCleanup';

const NAV_ITEMS = [
  { key: 'practice', label: 'Ghép cặp thực hành', icon: 'groups' },
  { key: 'classroom', label: 'Lớp học', icon: 'forum' },
  { key: 'history', label: 'Lịch sử luyện tập', icon: 'history' },
  { key: 'notifications', label: 'Thông báo', icon: 'notifications' },
  { key: 'teacherReviews', label: 'Bài học viên', icon: 'school' },
  { key: 'topicBuilder', label: 'Quản lý chủ đề', icon: 'library_add' },
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

function Sidebar({ activeTab, onChangeTab }) {
  return (
    <aside className="app-sidebar">
      <div className="app-brand">
        <div className="app-brand-icon">
          <span className="material-symbols-rounded icon-fill">record_voice_over</span>
        </div>
        <div>
          <h1>Try Your Speech</h1>
          <p>IELTS Speaking Lab</p>
        </div>
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
          </button>
        ))}
      </nav>

      <button
        type="button"
        className={`sidebar-profile-card ${activeTab === 'profile' ? 'active' : ''}`}
        onClick={() => onChangeTab('profile')}
      >
        <div className="sidebar-profile-avatar">NL</div>
        <div className="sidebar-profile-copy">
          <strong>Nguyễn Lê Huy</strong>
          <span>Học viên IELTS</span>
        </div>
      </button>
    </aside>
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
  return (
    <div className="practice-focus">
      <section className="practice-hero">
        <h2>Luyện IELTS Speaking với người học cùng band.</h2>
        <p>
          Nhập tên hiển thị và band hiện tại. Hệ thống sẽ ghép bạn với một đối tác có band gần nhất để bắt đầu phiên video call.
        </p>
        <div className="practice-stats">
          <div>
            <strong>±1.0</strong>
            <span>Khoảng band ghép cặp</span>
          </div>
          <div>
            <strong>3 part</strong>
            <span>Format IELTS Speaking</span>
          </div>
          <div>
            <strong>TAB</strong>
            <span>Đánh dấu lỗi khi nghe</span>
          </div>
        </div>
      </section>

      <Card className="practice-card practice-match-card">
        <CardContent className="p-5">
          <div className="practice-card-heading">
            <div>
              <span className="section-eyebrow">Thông tin ghép cặp</span>
              <h3>Tìm đối tác luyện tập</h3>
            </div>
            <span className="practice-live-pill">
              <span className="recording-dot" />
              Sẵn sàng
            </span>
          </div>
          {!isSearching ? (
            <form onSubmit={onSubmit} className="practice-match-form">
              <div className="space-y-2">
                <Label htmlFor="display-name">Tên hiển thị</Label>
                <Input
                  id="display-name"
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={displayName}
                  onChange={(e) => { setDisplayName(e.target.value); setNameError(''); }}
                  autoFocus
                  maxLength={100}
                  className={nameError ? 'border-red-400 focus-visible:ring-red-400' : ''}
                />
                {nameError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <span className="material-symbols-rounded" style={{ fontSize: 13 }}>error</span>
                    {nameError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="band-select">Band hiện tại</Label>
                  <span className="text-sm font-semibold text-orange-600 tabular-nums">{band}</span>
                </div>
                <input
                  id="band-select"
                  type="range"
                  min={0}
                  max={9}
                  step={0.5}
                  value={band}
                  onChange={(e) => setBand(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>0</span>
                  <span className="text-zinc-400">Chênh lệch tối đa ±1.0</span>
                  <span>9</span>
                </div>
              </div>

              <Button id="find-partner-btn" type="submit" className="w-full practice-primary-action" size="lg">
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>people</span>
                Tìm đối tác luyện tập
              </Button>
            </form>
          ) : (
            <div className="text-center py-4">
              <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-full bg-orange-50 mb-4">
                <span className="material-symbols-rounded icon-fill text-orange-600" style={{ fontSize: 26 }}>
                  person_search
                </span>
                <div className="absolute inset-[-6px] rounded-full border-2 border-orange-300 border-t-transparent animate-spin-slow" />
              </div>

              <h2 className="text-base font-semibold text-zinc-900 mb-1">Đang tìm đối tác...</h2>
              <p className="text-sm text-zinc-500 mb-4">
                Xin chào <span className="font-medium text-zinc-700">{displayName}</span>!
                Đang tìm người có Band {band} ± 1.0
              </p>

              <div className="text-xs text-zinc-500 bg-orange-50 border border-orange-100 rounded-lg px-4 py-2.5 mb-5">
                Chuẩn bị sẵn mic và camera trong lúc chờ
              </div>

              <Button variant="outline" onClick={onCancel} size="sm">
                <span className="material-symbols-rounded" style={{ fontSize: 15 }}>close</span>
                Hủy tìm kiếm
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
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

function ClassroomPostDetail({ post, focusSection, onBack }) {
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

  return (
    <section className="classroom-detail-page">
      <button type="button" className="classroom-back-button" onClick={onBack}>
        <span className="material-symbols-rounded">arrow_back</span>
        Quay lại lớp học
      </button>

      <div className="classroom-detail-hero">
        <div>
          <span className="section-eyebrow">{post.videoPlaceholder}</span>
          <h3>{post.title}</h3>
          <p>{post.description}</p>
        </div>
        <div className="classroom-detail-participants">
          {post.participants.map((participant) => (
            <div className="classroom-participant-card" key={participant.role}>
              <div className="classroom-participant-avatar">{participant.avatar}</div>
              <div>
                <strong>{participant.name}</strong>
                <span>Vai {participant.role} · Band {participant.band}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="classroom-detail-video">
        <span className="material-symbols-rounded icon-fill">play_circle</span>
        <strong>{post.videoPlaceholder}</strong>
        <small>Video bài nói</small>
      </div>

      <div className={`classroom-detail-section ${focusSection === 'ai' ? 'is-focused' : ''}`}>
        <div className="classroom-detail-heading">
          <div>
            <h3>
              <span className="material-symbols-rounded icon-fill">robot_2</span>
              Nhận xét từ AI
            </h3>
            <p>Đánh giá chi tiết theo các tiêu chí IELTS Speaking.</p>
          </div>
        </div>

        <div className="review-detail-summary">
          <strong>Đánh giá tổng quan</strong>
          <p>{post.aiComment}</p>
        </div>
        <div className="review-detail-grid">
          {aiCriteria.map((item) => (
            <div className="review-detail-card" key={item.label}>
              <div className="review-detail-card-top">
                <strong>{item.label}</strong>
                <span>{item.score}</span>
              </div>
              <p>{item.text}</p>
            </div>
          ))}
        </div>

        <div className="ai-transcript-section">
          <div className="ai-transcript-heading">
            <strong>Script bài nói và lỗi phát âm</strong>
            <span>Từ/cụm màu đỏ là vị trí AI phát hiện phát âm chưa rõ</span>
          </div>

          <div className="ai-transcript-list">
            {post.aiTranscripts.map((transcript) => (
              <div className="ai-transcript-card" key={`${transcript.speakerRole}-${transcript.partNumber}`}>
                <div className="ai-transcript-speaker">
                  <div>
                    <strong>{transcript.speakerName}</strong>
                    <span>Vai {transcript.speakerRole} · {transcript.partLabel}</span>
                  </div>
                  <small>{transcript.words.filter((word) => word.hasPronunciationError).length} lỗi phát âm</small>
                </div>

                <p className="ai-transcript-text">
                  {transcript.words.map((word, index) => (
                    <span
                      key={`${word.text}-${index}`}
                      className={word.hasPronunciationError ? 'pronunciation-error-word' : undefined}
                      title={word.feedback || undefined}
                    >
                      {word.text}
                    </span>
                  ))}
                </p>

                <div className="ai-pronunciation-list">
                  {transcript.words
                    .filter((word) => word.hasPronunciationError)
                    .map((word, index) => (
                      <div className="ai-pronunciation-item" key={`${word.text}-${index}`}>
                        <span>{word.text}</span>
                        <p>{word.feedback}</p>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`classroom-detail-section ${focusSection === 'peer' ? 'is-focused' : ''}`}>
        <div className="classroom-detail-heading">
          <div>
            <h3>
              <span className="material-symbols-rounded icon-fill">group</span>
              Nhận xét từ người tham gia
            </h3>
            <p>Mỗi ghi chú được chia theo Part, timestamp tính từ đầu part tương ứng.</p>
          </div>
        </div>

        <div className="review-detail-list">
          {post.peerReviews.map((review) => (
            <div className="peer-detail-card" key={`${review.reviewerRole}-${review.reviewerName}`}>
              <div className="peer-detail-top">
                <div className="peer-detail-avatar">{review.reviewerName.charAt(0)}</div>
                <div>
                  <strong>{review.reviewerName}</strong>
                  <span>Vai {review.reviewerRole} nhận xét bài nói của {review.targetName}</span>
                </div>
              </div>

              <div className="peer-part-groups">
                {groupNotesByPart(review.notes).map((partGroup) => (
                  <div className="peer-part-group" key={`${review.reviewerRole}-${partGroup.partNumber}`}>
                    <div className="peer-part-heading">
                      <strong>{partGroup.partLabel}</strong>
                      <span>{partGroup.notes.length} ghi chú</span>
                    </div>
                    <div className="peer-notes-list">
                      {partGroup.notes
                        .sort((a, b) => a.timestampMs - b.timestampMs)
                        .map((note) => {
                          const config = ERROR_TYPE_CONFIG[note.errorType] || ERROR_TYPE_CONFIG.fluency;
                          return (
                            <div
                              className="peer-note-detail-row"
                              key={`${review.reviewerRole}-${note.partNumber}-${note.timestampMs}-${note.errorType}`}
                              style={{ borderLeftColor: config.borderColor }}
                            >
                              <div className="peer-note-meta">
                                <span className="peer-note-part">Part {note.partNumber}</span>
                                <span className={`peer-note-type ${config.badgeClass}`}>{config.label}</span>
                                <span className="peer-note-time">lúc {formatTimestamp(note.timestampMs)} của part này</span>
                              </div>
                              <p className="peer-note-question">{note.questionText}</p>
                              <p>{note.noteText}</p>
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
    </section>
  );
}

function ClassroomPostCard({ post, onOpenDetail }) {
  const peerNoteCount = post.peerReviews.reduce((total, review) => total + review.notes.length, 0);

  return (
    <article className="classroom-post-x">
      <div className="post-x-avatar">{post.author.avatar}</div>
      <div className="post-x-content">
        <div className="post-x-header">
          <span className="post-x-name">{post.author.name}</span>
          <span className="post-x-dot">·</span>
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
                <span>Vai {participant.role} · Band {participant.band}</span>
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

          {post.peerReviews.length > 0 && (
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

export default function LobbyPage() {
  const [activeTab, setActiveTab] = useState('practice');
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
      <Sidebar activeTab={activeTab} onChangeTab={setActiveTab} />

      <main className={`app-main ${activeTab === 'practice' ? 'app-main-practice' : ''}`}>
        <header className="app-topbar">
          <div>
            {activeTab !== 'practice' && <div className="section-eyebrow">Không gian học tập</div>}
            <h2>{activeTab === 'profile' ? 'Quản lý thông tin cá nhân' : NAV_ITEMS.find((item) => item.key === activeTab)?.label}</h2>
          </div>
          
        </header>

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
        {activeTab === 'classroom' && <ClassroomPanel />}
        {activeTab === 'history' && <UserHistoryPanel />}
        {activeTab === 'notifications' && <NotificationsPanel />}
        {activeTab === 'teacherReviews' && <TeacherReviewsPanel />}
        {activeTab === 'topicBuilder' && <TopicBuilderPanel />}
        {activeTab === 'profile' && <ProfilePanel />}
      </main>
    </div>
  );
}
