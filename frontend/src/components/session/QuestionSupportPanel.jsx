function getCueCardItems(cueCard) {
  if (!cueCard) return [];
  if (Array.isArray(cueCard)) return cueCard;
  if (Array.isArray(cueCard.bullet_points)) return cueCard.bullet_points;
  return [];
}

function getPartLabel(partNumber) {
  if (partNumber === 1) return 'Part 1 · Câu hỏi ngắn';
  if (partNumber === 2) return 'Part 2 · Cue card';
  return 'Part 3 · Thảo luận sâu';
}

function getTaskText(isSpeaker, partNumber) {
  if (isSpeaker) {
    if (partNumber === 2) {
      return 'Nói thành một câu chuyện mạch lạc. Bám đủ các ý trong cue card và dùng ví dụ cụ thể.';
    }

    return 'Trả lời trực tiếp câu hỏi, sau đó mở rộng bằng lý do hoặc ví dụ ngắn.';
  }

  return 'Lắng nghe câu trả lời. Bấm TAB khi nghe thấy lỗi cần góp ý, sau đó chọn loại lỗi bằng phím 1-4.';
}

export function QuestionSupportPanel({ turn, totalTurns, isSpeaker }) {
  const phrases = Array.isArray(turn?.suggestedPhrases) ? turn.suggestedPhrases : [];
  const cueItems = getCueCardItems(turn?.cueCard);

  return (
    <aside className="question-panel">
      <div className="question-panel-top">
        <div>
          <div className="session-eyebrow">{getPartLabel(turn?.partNumber)}</div>
          <div className="question-progress">Lượt {turn?.turnIndex}/{totalTurns}</div>
        </div>
        <span className={isSpeaker ? 'mode-pill speaker' : 'mode-pill listener'}>
          {isSpeaker ? 'Bạn nói' : 'Bạn nghe'}
        </span>
      </div>

      <section className="question-focus">
        <div className="session-eyebrow">Câu hỏi hiện tại</div>
        <h2>{turn?.questionText || 'Đang tải câu hỏi...'}</h2>

        {cueItems.length > 0 && (
          <div className="cue-card-box">
            <p>You should say:</p>
            <ul>
              {cueItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="task-box">
        <div className="session-eyebrow">Việc cần làm</div>
        <p>{getTaskText(isSpeaker, turn?.partNumber)}</p>
      </section>

      <details className="phrases-panel">
        <summary>
          <span>Cụm từ gợi ý theo chủ đề</span>
          <span className="material-symbols-rounded">expand_more</span>
        </summary>
        {phrases.length > 0 ? (
          <ul>
            {phrases.map((phrase) => (
              <li key={phrase}>{phrase}</li>
            ))}
          </ul>
        ) : (
          <p>Chưa có cụm từ gợi ý cho câu hỏi này.</p>
        )}
      </details>

      <section className="session-rules">
        <div>
          <strong>Timer</strong>
          <span>Tự chuyển lượt khi hết giờ.</span>
        </div>
        <div>
          <strong>TAB</strong>
          <span>Đánh dấu lỗi theo timestamp khi đang nghe.</span>
        </div>
      </section>
    </aside>
  );
}
