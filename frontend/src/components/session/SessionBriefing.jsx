import { useMemo, useState } from 'react';
import { SessionCallControls } from './SessionCallControls';
import { CameraOffOverlay } from './CameraOffOverlay';
import { useSession } from '../../context/SessionContext';
import { getTurnGapMs } from '../../utils/sessionTimeline';

const PART_TITLES = {
  1: 'Part 1 - Câu hỏi ngắn',
  2: 'Part 2 - Cue card',
  3: 'Part 3 - Thảo luận sâu',
};

const GUIDE_PAGE_INTRO = {
  eyebrow: 'Hướng dẫn',
  title: 'HÃY ĐỌC KỸ HƯỚNG DẪN',
  intro: [
    'Các bạn hãy làm quen nhau với nhau cũng như đọc kỹ hướng dẫn để có trải nghiệm tốt nhất nhé. Hệ thống sẽ cho kết quả của bài nói tốt hơn khi các bạn đảm bảo được chất lượng âm thanh đầu vào của micro rõ và kết nối mạng ổn định.',
    'Khi đã sẵn sàng, hãy bấm vào nút SẴN SÀNG, khi cả hai đều sẵn sàng chúng ta sẽ bước vào phiên luyện nói.',
    'Trong lượt bạn đóng vai người nghe, mic của bạn được tắt tự động để không lẫn vào bài nói của bạn học, và sẽ tự bật lại khi đến lượt bạn. Để đánh dấu và ghi chú nhanh, hãy thực hiện các thao tác sau:',
  ],
  steps: [
    'Khi phát hiện điều đáng ghi lại từ bạn học, hãy bấm TAB. Một khu vực chọn loại đánh dấu sẽ xuất hiện, gồm 5 loại cần chú ý (ngữ pháp, cách dùng từ, ngập ngừng, nói lại từ đầu, phát âm) và 3 loại điểm tốt (từ vựng hay, nối ý tốt, ý phát triển sâu).',
    'Mỗi loại tương ứng với một phím từ 1 đến 8. Hãy bấm phím tương ứng để chọn.',
    'Sau khi chọn loại, sẽ có một khu vực để bạn ghi chú cụ thể. Bạn có thể bấm Enter để bỏ qua và bổ sung sau ở phần Review.',
  ],
};

function formatSeconds(ms) {
  return `${Math.round((Number(ms) || 0) / 1000)} giây`;
}

// Mô tả đúng phiên đang chạy thay vì in cứng thời lượng. Phần chữ này trước đây
// vẫn ghi "30 giây chuẩn bị và 30 giây trả lời" của chế độ test, nên sau khi
// thời lượng được trả về đúng chuẩn IELTS thì màn hình nói một đằng, hệ thống
// chạy một nẻo. Đọc từ `turns` cũng tự đúng luôn với việc chọn luyện riêng một
// part: chỉ hiện những part mà phiên này thực sự có.
function buildPartCards(turns) {
  const parts = new Map();

  for (const turn of turns) {
    if (!parts.has(turn.partNumber)) {
      parts.set(turn.partNumber, {
        partNumber: turn.partNumber,
        questionIds: new Set(),
        durationMs: turn.durationMs,
        prepDurationMs: turn.prepDurationMs,
      });
    }

    parts.get(turn.partNumber).questionIds.add(turn.questionId);
  }

  return [...parts.values()]
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((part) => ({
      title: PART_TITLES[part.partNumber] || `Part ${part.partNumber}`,
      body: `${part.questionIds.size} ${part.partNumber === 2 ? 'cue card' : 'câu hỏi'}. Mỗi lượt ${
        part.prepDurationMs > 0
          ? `có ${formatSeconds(part.prepDurationMs)} chuẩn bị, sau đó ${formatSeconds(part.durationMs)} trả lời`
          : `trả lời ngay trong ${formatSeconds(part.durationMs)}, không có thời gian chuẩn bị`
      }.`,
    }));
}

function buildGuidePages(turns) {
  if (!Array.isArray(turns) || turns.length === 0) {
    return [GUIDE_PAGE_INTRO];
  }

  const partCards = buildPartCards(turns);
  // Cộng cả khoảng chờ, không chỉ thời gian nói. Nó có mặt trước mỗi lượt không
  // có thời gian chuẩn bị — đúng điều kiện mà `getSyncedTimeline` dùng — và
  // cộng lại là vài phút, nên bỏ qua thì con số ở đây hụt hẳn so với buổi thật
  // và người dùng canh giờ theo nó sẽ bị trễ.
  const totalMs = turns.reduce((sum, turn, turnIndex) => {
    const prepDurationMs = Number(turn.prepDurationMs) || 0;
    const gapMs = prepDurationMs > 0 ? 0 : getTurnGapMs(turns, turnIndex);

    return sum + gapMs + prepDurationMs + (Number(turn.durationMs) || 0);
  }, 0);
  const partList = partCards.length === 1
    ? `riêng ${partCards[0].title.split(' - ')[0]}`
    : `${partCards.length} phần`;

  return [
    GUIDE_PAGE_INTRO,
    {
      eyebrow: 'Cơ chế phiên luyện',
      title: 'IELTS SPEAKING TRONG PHIÊN LUYỆN',
      intro: [
        `Phiên này luyện ${partList} theo đúng thời lượng IELTS Speaking, tổng ${turns.length} lượt nói và khoảng ${Math.max(
          1,
          Math.round(totalMs / 60000)
        )} phút. Mỗi người trả lời hết một part rồi mới đổi lượt — giống một lượt thi liền mạch — còn người kia lắng nghe và đánh dấu lỗi theo thời gian thực. Người mở màn đổi qua lại giữa các part để không ai luôn phải nói trước.`,
      ],
      cards: [
        ...partCards,
        {
          title: 'Sau phần nói',
          body: 'Hai bạn chuyển sang Review, nghe lại audio và bổ sung ghi chú cho nhau. Ghi chú của bạn được gửi cho bạn học, và là điều kiện để hệ thống bắt đầu chấm bài nói của mỗi người.',
        },
      ],
    },
  ];
}

export function SessionBriefing({
  localVideoRef,
  remoteVideoRef,
  partnerName,
  turns,
  myReady,
  partnerReady,
  onReady,
  onEndCall,
}) {
  const { state } = useSession();
  const [showGuide, setShowGuide] = useState(true);
  const [guidePage, setGuidePage] = useState(0);
  const guidePages = useMemo(() => buildGuidePages(turns), [turns]);
  const currentPage = guidePages[Math.min(guidePage, guidePages.length - 1)];

  function goToPreviousPage() {
    setGuidePage((page) => Math.max(0, page - 1));
  }

  function goToNextPage() {
    setGuidePage((page) => Math.min(guidePages.length - 1, page + 1));
  }

  return (
    <div className="session-layout">
      <div className="session-header session-header-tall">
        <div>
          <div className="session-eyebrow">Bước chuẩn bị</div>
          <h1 className="session-title">Làm quen trước khi bắt đầu IELTS Speaking</h1>
        </div>
        <div className="warmup-ready-summary">
          <span className={myReady ? 'ready' : ''}>Bạn {myReady ? 'đã sẵn sàng' : 'chưa sẵn sàng'}</span>
          <span className={partnerReady ? 'ready' : ''}>{partnerName || 'Đối tác'} {partnerReady ? 'đã sẵn sàng' : 'chưa sẵn sàng'}</span>
        </div>
        <div className="session-role-chip">Phiên luyện 2 người</div>
      </div>

      <div className="warmup-stage">
        <section className="warmup-video-pane">
          <video ref={localVideoRef} autoPlay playsInline muted />
          {state.cameraOff && <CameraOffOverlay label="Camera của bạn đang tắt" />}
          <div className="video-label">Bạn</div>
        </section>

        <section className="warmup-video-pane">
          <video ref={remoteVideoRef} autoPlay playsInline />
          {state.partnerCameraOff && (
            <CameraOffOverlay label={`${partnerName || 'Đối tác'} đã tắt camera`} />
          )}
          <div className="video-label">{partnerName || 'Đối tác'}</div>
        </section>

        {showGuide && (
          <aside className="warmup-guide-window">
            <div className="warmup-guide-titlebar">
              <div>
                <div className="session-eyebrow">{currentPage.eyebrow}</div>
                <h2>{currentPage.title}</h2>
              </div>
              <button
                type="button"
                className="warmup-guide-close"
                aria-label="Đóng hướng dẫn"
                onClick={() => setShowGuide(false)}
              >
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="warmup-guide-page">
              {currentPage.intro.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}

              {currentPage.steps && (
                <div className="warmup-steps">
                  {currentPage.steps.map((step, index) => (
                    <div className="warmup-step" key={step}>
                      <span>{index + 1}</span>
                      <p>{step}</p>
                    </div>
                  ))}
                </div>
              )}

              {currentPage.cards && (
                <div className="session-info-band warmup-guide-cards">
                  {currentPage.cards.map((card) => (
                    <div key={card.title}>
                      <strong>{card.title}</strong>
                      <span>{card.body}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="warmup-guide-actions">
              <button
                type="button"
                className="warmup-guide-nav"
                aria-label="Trang trước"
                onClick={goToPreviousPage}
                disabled={guidePage === 0}
              >
                <span className="material-symbols-rounded">chevron_left</span>
              </button>
              <span className="warmup-guide-page-indicator">
                {guidePage + 1} / {guidePages.length}
              </span>
              <button
                type="button"
                className="warmup-guide-nav"
                aria-label="Trang sau"
                onClick={goToNextPage}
                disabled={guidePage === guidePages.length - 1}
              >
                <span className="material-symbols-rounded">chevron_right</span>
              </button>
            </div>
          </aside>
        )}

        {!showGuide && (
          <button
            type="button"
            className="warmup-guide-reopen"
            onClick={() => setShowGuide(true)}
          >
            <span className="material-symbols-rounded">info</span>
            Hướng dẫn
          </button>
        )}

        <div className="warmup-bottom-dock">
          <SessionCallControls remoteVideoRef={remoteVideoRef} onEndCall={onEndCall} compact />

          <div className="warmup-confirm-bar">
          <div>
            <strong>{myReady ? 'Đang chờ đối tác xác nhận' : 'Bạn đã sẵn sàng bắt đầu bài luyện?'}</strong>
            <span>
              {myReady
                ? 'Giữ kết nối mở. Hệ thống sẽ tự chuyển sang phần chuẩn bị khi đối tác cũng đồng ý.'
                : 'Bạn vẫn có thể tiếp tục làm quen hoặc đọc hướng dẫn trước khi bấm nút này.'}
            </span>
          </div>
          <button type="button" className="ready-confirm-button" onClick={onReady} disabled={myReady}>
            <span className="material-symbols-rounded">check_circle</span>
            {myReady ? 'ĐÃ SẴN SÀNG' : 'SẴN SÀNG'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
