import { useEffect } from 'react';

// Màn chuyển lượt. Trước đây nó chỉ là một tấm phủ đen báo "đổi lượt", và câu
// hỏi nằm khuất phía sau — nên khoảng nghỉ này trôi qua mà không ai đọc được
// gì, rồi câu hỏi hiện ra đúng lúc đồng hồ ghi âm bắt đầu chạy. Người nói phải
// vừa đọc vừa trả lời, và mấy giây đọc đề bị tính vào bài của họ.
//
// Giờ câu hỏi hiện ngay tại đây, kèm đếm ngược, nên khoảng chuyển lượt trở
// thành thời gian đọc đề. Người nghe cũng đọc được, nhờ đó vào lượt là đánh
// dấu lỗi được ngay thay vì mất mấy giây đoán đối tác đang trả lời câu gì.
export function TurnTransition({
  message,
  subMessage,
  questionText,
  roleBar,
  onDone,
  delayMs = 3000,
}) {
  useEffect(() => {
    const id = setTimeout(() => { if (onDone) onDone(); }, delayMs);
    return () => clearTimeout(id);
  }, [onDone, delayMs]);

  // Suy thẳng từ `delayMs` chứ không nuôi bộ đếm riêng: prop này được tính lại
  // từ timeline chung mỗi 250ms, nên số đang đếm luôn là số thật của phiên. Một
  // bộ đếm cục bộ sẽ trôi khỏi timeline khi máy chậm hoặc người dùng đổi tab.
  const secondsLeft = Math.max(0, Math.ceil(delayMs / 1000));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(9, 9, 11, 0.92)', backdropFilter: 'blur(12px)' }}
    >
      <div className="animate-scale-in w-full max-w-2xl px-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 mb-5">
          <span className="material-symbols-rounded text-zinc-300" style={{ fontSize: 26 }}>
            swap_horiz
          </span>
        </div>
        <h2 className="text-lg font-semibold text-white mb-1.5">{message}</h2>
        {subMessage && <p className="text-sm text-zinc-400">{subMessage}</p>}

        {roleBar && <div className="mt-4">{roleBar}</div>}

        {questionText && (
          <div className="mt-5 rounded-2xl border border-zinc-700 bg-zinc-900/80 px-5 py-5 text-left">
            <p className="text-xl font-medium leading-snug text-white">{questionText}</p>
          </div>
        )}

        <p className="mt-5 text-sm text-zinc-400">
          {questionText ? 'Đọc câu hỏi, bắt đầu sau ' : 'Bắt đầu sau '}
          <span className="font-semibold tabular-nums text-white">{secondsLeft}s</span>
        </p>

        <div className="flex gap-1.5 justify-center mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-zinc-500"
              style={{ animation: `blink 1.2s ${i * 0.2}s ease infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
