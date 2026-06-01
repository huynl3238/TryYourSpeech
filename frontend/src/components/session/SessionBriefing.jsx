import { useState } from 'react';
import { SessionCallControls } from './SessionCallControls';

const GUIDE_PAGES = [
  {
    eyebrow: 'Hướng dẫn',
    title: 'HÃY ĐỌC KỸ HƯỚNG DẪN',
    intro: [
      'Các bạn hãy làm quen nhau với nhau cũng như đọc kỹ hướng dẫn để có trải nghiệm tốt nhất nhé. Hệ thống sẽ cho kết quả của bài nói tốt hơn khi các bạn đảm bảo được chất lượng âm thanh đầu vào của micro rõ và kết nối mạng ổn định.',
      'Khi đã sẵn sàng, hãy bấm vào nút SẴN SÀNG, khi cả hai đều sẵn sàng chúng ta sẽ bước vào phiên luyện nói.',
      'Đối với lượt bạn đóng vai là người nghe, để có thể đánh dấu và ghi chú nhanh hãy thực hiện các thao tác sau:',
    ],
    steps: [
      'Khi phát hiện lỗi từ bạn học, hãy bấm TAB, khi đó sẽ xuất hiện một khu vực để các bạn đánh dấu loại lỗi đã nghe ra: Phát âm, Ngữ pháp, Từ vựng, Lưu loát,...',
      'Mỗi loại lỗi tương ứng với các phím 1, 2, 3, 4,... Hãy bấm phím tương ứng để lựa chọn loại lỗi.',
      'Sau khi chọn loại lỗi, sẽ có một khu vực để bạn có thể ghi chú cụ thể thông tin về lỗi đó. Bạn có thể bấm Enter để bỏ qua và bổ sung sau ở phần Review.',
    ],
  },
  {
    eyebrow: 'Cơ chế phiên luyện',
    title: 'IELTS SPEAKING TRONG PHIÊN LUYỆN',
    intro: [
      'Phiên luyện mô phỏng cấu trúc IELTS Speaking với 3 phần. Hai bạn sẽ thay phiên trả lời cùng một câu hỏi, người còn lại lắng nghe và đánh dấu lỗi theo thời gian thực.',
    ],
    cards: [
      {
        title: 'Part 1 - Câu hỏi ngắn',
        body: 'Bản test nhanh dùng 1 câu Part 1. Mỗi lượt có 30 giây chuẩn bị và 30 giây trả lời.',
      },
      {
        title: 'Part 2 - Cue card',
        body: 'Bản test nhanh dùng 1 cue card Part 2. Mỗi lượt có 60 giây chuẩn bị và 30 giây trả lời.',
      },
      {
        title: 'Part 3 - Thảo luận sâu',
        body: 'Bản test nhanh dùng 1 câu Part 3. Mỗi lượt có 30 giây chuẩn bị và 30 giây trả lời.',
      },
      {
        title: 'Sau phần nói',
        body: 'Hai bạn chuyển sang Review, nghe lại audio của đối phương và bổ sung ghi chú. AI/audio upload đang tạm tắt để tập trung test video call.',
      },
    ],
  },
];

export function SessionBriefing({
  localVideoRef,
  remoteVideoRef,
  partnerName,
  myReady,
  partnerReady,
  onReady,
  onEndCall,
}) {
  const [showGuide, setShowGuide] = useState(true);
  const [guidePage, setGuidePage] = useState(0);
  const currentPage = GUIDE_PAGES[guidePage];

  function goToPreviousPage() {
    setGuidePage((page) => Math.max(0, page - 1));
  }

  function goToNextPage() {
    setGuidePage((page) => Math.min(GUIDE_PAGES.length - 1, page + 1));
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
          <div className="video-label">Bạn</div>
        </section>

        <section className="warmup-video-pane">
          <video ref={remoteVideoRef} autoPlay playsInline />
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
                {guidePage + 1} / {GUIDE_PAGES.length}
              </span>
              <button
                type="button"
                className="warmup-guide-nav"
                aria-label="Trang sau"
                onClick={goToNextPage}
                disabled={guidePage === GUIDE_PAGES.length - 1}
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
