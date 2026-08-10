// Khối "Nhận xét từ AI" của một bài đã public lên Lớp học.
//
// Bản trước của khối này viết cứng bốn tiêu chí ngay trong `LobbyPage.jsx`, điểm
// chọn theo `post.id === 1 ? '6.5' : '7.0'` — số bịa hiển thị như số AI chấm thật,
// kèm cả tiêu chí Pronunciation trong khi phát âm đã bị bỏ khỏi band ngày 09/08.
// Lý do nó tồn tại: API lúc đó không trả về điểm từng tiêu chí nên frontend không
// có gì thật để hiện. Nay `classroomModel` đã trả `post.ai` lấy nguyên từ bảng
// `session_ai_results`.
//
// Nguyên tắc của file này: **không có số nào được hiện nếu chưa chấm xong.**
// `status !== 'completed'` thì nói thẳng là chưa có, không đoán, không lấp chỗ.

// Khoá trong `holistic_feedback.criteria` do LLM sinh ra, khác tên cột trong
// database (fluency_score…), nên phải giữ cả hai đường.
const CRITERIA = [
  { key: 'fluencyCoherence', scoreKey: 'fluency', label: 'Fluency & Coherence', color: '#2563EB' },
  { key: 'lexicalResource', scoreKey: 'lexical', label: 'Lexical Resource', color: '#059669' },
  { key: 'grammaticalRangeAccuracy', scoreKey: 'grammar', label: 'Grammar Range & Accuracy', color: '#D97706' },
];

function formatBand(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(1) : '—';
}

function EmptyNotice({ icon, title, text }) {
  return (
    <div className="mt-4 flex gap-3 rounded-xl border border-dashed border-[#EAE7E3] bg-[#FAFAF8] px-4 py-3.5">
      <span
        className="material-symbols-rounded flex-shrink-0 text-[#A8A29E]"
        style={{ fontSize: 19 }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#57534E]">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#A8A29E]">{text}</p>
      </div>
    </div>
  );
}

function CriterionCard({ label, color, band, feedback, evidence }) {
  return (
    <div
      className="rounded-xl border border-[#EAE7E3] p-3.5"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[12.5px] text-[#1C1917]">{label}</strong>
        <span
          className="flex-shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-white"
          style={{ background: color }}
        >
          {formatBand(band)}
        </span>
      </div>
      {feedback && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#57534E]">{feedback}</p>
      )}
      {evidence && (
        <p className="mt-1 text-[11.5px] italic leading-relaxed text-[#A8A29E]">
          Dẫn chứng: {evidence}
        </p>
      )}
    </div>
  );
}

export function ClassroomAiFeedback({ post }) {
  // Phiên mentor CỐ Ý không chạy AI: mentor tự đánh dấu lỗi và viết nhận xét. Nên
  // ở đây không được hiện "chưa có kết quả AI" như thể đang thiếu một thứ gì.
  if (post.sessionMode === 'mentor') {
    return (
      <>
        <div className="flex items-center gap-2 text-[15px] font-bold text-[#1C1917]">
          <span
            className="material-symbols-rounded icon-fill text-[#D97757]"
            style={{ fontSize: 19 }}
            aria-hidden="true"
          >
            cast_for_education
          </span>
          Nhận xét từ mentor
        </div>
        <p className="mt-0.5 text-xs text-[#78716C]">
          Phiên luyện với mentor được nhận xét trực tiếp bởi người dạy, không chấm bằng AI.
        </p>

        {post.aiComment && (
          <div
            className="mt-4 rounded-xl border border-[#EAC7B9] p-3.5"
            style={{ background: '#FBF4EF' }}
          >
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#8A4A33]">
              Nhận xét tổng quan
            </div>
            <p className="text-[13.5px] leading-relaxed text-[#1C1917]">{post.aiComment}</p>
          </div>
        )}
      </>
    );
  }

  const ai = post.ai || {};
  const feedback = ai.feedback || {};
  const overall = feedback.overall || {};
  const criteriaFeedback = feedback.criteria || {};
  const isComplete = ai.status === 'completed';

  return (
    <>
      <div className="flex items-center gap-2 text-[15px] font-bold text-[#1C1917]">
        <span
          className="material-symbols-rounded icon-fill text-[#D97757]"
          style={{ fontSize: 19 }}
          aria-hidden="true"
        >
          robot_2
        </span>
        Nhận xét từ AI
      </div>
      <p className="mt-0.5 text-xs text-[#78716C]">
        Ba tiêu chí ngôn ngữ của IELTS Speaking. Phát âm được đo riêng và không cộng vào band tổng.
      </p>

      {!isComplete ? (
        ai.status === 'failed' ? (
          <EmptyNotice
            icon="error"
            title="AI gặp lỗi khi chấm phiên này"
            text="Bài nói và ghi chú của người nghe vẫn xem được ở phần dưới."
          />
        ) : ai.status === 'processing' ? (
          <EmptyNotice
            icon="hourglass_top"
            title="AI đang chấm phiên này"
            text="Kết quả sẽ hiện ở đây khi chấm xong."
          />
        ) : (
          <EmptyNotice
            icon="info"
            title="Phiên này chưa có kết quả AI"
            text="Bài nói và ghi chú của người nghe vẫn xem được ở phần dưới."
          />
        )
      ) : (
        <>
          <div
            className="mt-4 flex items-center gap-4 rounded-xl border border-[#EAC7B9] p-3.5"
            style={{ background: '#FBF4EF' }}
          >
            <div className="flex flex-col items-center border-r border-[#EAC7B9] pr-4">
              <b className="text-[26px] font-extrabold leading-none tabular-nums tracking-tight text-[#D97757]">
                {formatBand(ai.overallBand)}
              </b>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#78716C]">
                Band tổng
              </span>
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#8A4A33]">
                Đánh giá tổng quan
              </div>
              <p className="text-[13.5px] leading-relaxed text-[#1C1917]">
                {overall.summary || post.aiComment}
              </p>
            </div>
          </div>

          {overall.strengths?.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#059669]">
                Điểm mạnh
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {overall.strengths.map((item, index) => (
                  <li key={index} className="text-[12.5px] leading-relaxed text-[#57534E]">{item}</li>
                ))}
              </ul>
            </div>
          )}

          {overall.improvements?.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#B45309]">
                Cần cải thiện
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {overall.improvements.map((item, index) => (
                  <li key={index} className="text-[12.5px] leading-relaxed text-[#57534E]">{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {CRITERIA.map(({ key, scoreKey, label, color }) => {
              const detail = criteriaFeedback[key] || {};
              return (
                <CriterionCard
                  key={key}
                  label={label}
                  color={color}
                  // Điểm trong JSON của LLM và cột trong database là hai nguồn của
                  // cùng một con số; lấy cột làm chuẩn vì đó là thứ band tổng được
                  // tính ra từ đó.
                  band={ai.scores?.[scoreKey] ?? detail.band}
                  feedback={detail.feedback}
                  evidence={detail.evidence}
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
