// Khoảng nghỉ chèn giữa hai lượt liền nhau. Part 1 và Part 3 có
// `prepDurationMs = 0` vì đúng chuẩn IELTS là hỏi rồi trả lời ngay, nên trước
// đây đồng hồ hết ở tick nào là lượt kế tiếp bắt đầu ngay tick đó: người đang
// nói bị cắt giữa câu, người kế tiếp không có tín hiệu nào báo đến lượt mình.
// Part 2 không cần vì 60 giây chuẩn bị đã là khoảng đệm.
export const TURN_GAP_MS = 4000;

// Toàn bộ tiến trình một phiên luyện được suy ra từ đúng hai thứ: mảng `turns`
// lấy từ backend, và mốc `practice_start`. Hai máy chạy hàm này độc lập nên
// không được có bất kỳ khoảng thời gian nào chỉ tồn tại ở một phía — nếu có,
// hai bên sẽ lệch nhau và lệch tích lũy qua từng lượt. Đó là lý do khoảng nghỉ
// giữa các lượt là một hằng số trong phép tính này chứ không phải một `setTimeout`
// ở tầng component.
//
// Hàm thuần, không đọc `performance.now()` — thời điểm được truyền vào qua `now`
// để tính được cho bất kỳ mốc nào và kiểm chứng được bằng số cụ thể.
export function getSyncedTimeline(turns, practiceStartLocalTime, now) {
  if (!Array.isArray(turns) || turns.length === 0 || !Number.isFinite(practiceStartLocalTime)) {
    return null;
  }

  const elapsedMs = Math.max(0, now - practiceStartLocalTime);
  let stepStartOffsetMs = 0;

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turn = turns[turnIndex];
    const prepDurationMs = Number(turn.prepDurationMs) || 0;
    const speakDurationMs = Number(turn.durationMs) || 0;

    if (turnIndex > 0 && prepDurationMs === 0) {
      const gapEndOffsetMs = stepStartOffsetMs + TURN_GAP_MS;
      if (elapsedMs < gapEndOffsetMs) {
        return {
          phase: 'transition',
          turnIndex,
          stepStartedAtMs: practiceStartLocalTime + stepStartOffsetMs,
          isComplete: false,
        };
      }
      stepStartOffsetMs = gapEndOffsetMs;
    }

    if (prepDurationMs > 0) {
      const prepEndOffsetMs = stepStartOffsetMs + prepDurationMs;
      if (elapsedMs < prepEndOffsetMs) {
        return {
          phase: 'prep',
          turnIndex,
          stepStartedAtMs: practiceStartLocalTime + stepStartOffsetMs,
          isComplete: false,
        };
      }
      stepStartOffsetMs = prepEndOffsetMs;
    }

    const speakEndOffsetMs = stepStartOffsetMs + speakDurationMs;
    if (elapsedMs < speakEndOffsetMs) {
      return {
        phase: 'speaking',
        turnIndex,
        stepStartedAtMs: practiceStartLocalTime + stepStartOffsetMs,
        isComplete: false,
      };
    }
    stepStartOffsetMs = speakEndOffsetMs;
  }

  return {
    phase: 'complete',
    turnIndex: turns.length,
    stepStartedAtMs: practiceStartLocalTime + stepStartOffsetMs,
    isComplete: true,
  };
}
