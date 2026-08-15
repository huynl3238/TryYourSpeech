// Khoảng chờ chèn trước mỗi lượt của Part 1 và Part 3 (Part 2 không cần vì 60
// giây đọc cue card đã là khoảng đệm). Trong đó câu hỏi được hiện sẵn, nên đây
// chính là thời gian đọc đề — đúng như trong phòng thi giám khảo mất mấy giây
// đọc câu hỏi lên, và phần đó không bị tính vào thời gian trả lời.
//
// Hai độ dài cho hai tình huống khác nhau, vì mỗi người nói hết cả part rồi
// mới đổi lượt:
//
//   - Cùng người, sang câu tiếp: chỉ cần đọc đề. 5 giây.
//   - Đổi người: còn phải báo đổi vai và chuyển mic, người kia phải kịp nhận ra
//     tới lượt mình. 8 giây.
//
// Vẫn KHÔNG phải `prepDurationMs`: Part 1 và Part 3 giữ đúng 0 giây chuẩn bị
// như IELTS thật. Hai thứ này thay thế nhau chứ không cộng vào nhau — lượt nào
// có thời gian chuẩn bị thì đi thẳng vào màn chuẩn bị, không có khoảng chờ.
export const SPEAKER_CHANGE_GAP_MS = 8000;
export const NEXT_QUESTION_GAP_MS = 5000;

// Lượt đầu tiên của cả buổi tính là đổi người: chưa ai nói gì, và người mở màn
// cũng cần được báo là đến lượt mình y như mọi lần đổi vai khác.
export function getTurnGapMs(turns, turnIndex) {
  const previousTurn = turns[turnIndex - 1];

  if (!previousTurn) {
    return SPEAKER_CHANGE_GAP_MS;
  }

  return previousTurn.speakerRole === turns[turnIndex].speakerRole
    ? NEXT_QUESTION_GAP_MS
    : SPEAKER_CHANGE_GAP_MS;
}

// Vị trí của một lượt trong khối liền mạch của cùng một người, trong cùng một
// part — để màn hình nói được "Câu 2/4" thay vì "Lượt 6/16", con số mà từ khi
// chia khối thì không còn nghĩa gì với người đang nói.
//
// Phải chặn theo cả part chứ không chỉ theo người: người chốt một part cũng có
// thể là người mở part kế tiếp (Part 1 kết bằng B thì Part 2 mở bằng B), nên
// nếu chỉ so người thì hai khối liền nhau bị dính thành một.
export function getTurnBlockPosition(turns, turnIndex) {
  const turn = turns?.[turnIndex];

  if (!turn) {
    return null;
  }

  const sameBlock = (other) =>
    other && other.speakerRole === turn.speakerRole && other.partNumber === turn.partNumber;

  let firstIndex = turnIndex;
  while (sameBlock(turns[firstIndex - 1])) {
    firstIndex -= 1;
  }

  let lastIndex = turnIndex;
  while (sameBlock(turns[lastIndex + 1])) {
    lastIndex += 1;
  }

  return {
    position: turnIndex - firstIndex + 1,
    total: lastIndex - firstIndex + 1,
  };
}

// Toàn bộ tiến trình một phiên luyện được suy ra từ đúng hai thứ: mảng `turns`
// lấy từ backend, và mốc `practice_start`. Hai máy chạy hàm này độc lập nên
// không được có bất kỳ khoảng thời gian nào chỉ tồn tại ở một phía — nếu có,
// hai bên sẽ lệch nhau và lệch tích lũy qua từng lượt. Đó là lý do khoảng nghỉ
// giữa các lượt là một hằng số trong phép tính này chứ không phải một `setTimeout`
// ở tầng component.
//
// Hàm thuần, không đọc `performance.now()` — thời điểm được truyền vào qua `now`
// để tính được cho bất kỳ mốc nào và kiểm chứng được bằng số cụ thể.
//
// `earlyTurnEnds` là { [turnIndex]: số mili giây đã nói thật }. Người nói bấm kết
// thúc sớm thì lượt đó ngắn lại, và MỌI bước phía sau dịch lên đúng bằng phần
// tiết kiệm được. Nó là tham số chứ không phải trạng thái nội bộ vì đúng cái ràng
// buộc ghi ở trên: hai máy phải tính ra cùng một kết quả. Server phát cùng một
// con số cho cả hai bên, kể cả cho chính người vừa bấm, nên không bên nào tự suy
// ra một mốc thời gian mà bên kia không có.
export function getEffectiveSpeakDurationMs(turn, turnIndex, earlyTurnEnds) {
  const plannedMs = Number(turn?.durationMs) || 0;
  const spokenMs = Number(earlyTurnEnds?.[turnIndex]);

  if (!Number.isFinite(spokenMs) || spokenMs < 0) {
    return plannedMs;
  }

  // Không bao giờ dài hơn kế hoạch: một con số hỏng hoặc bị sửa từ client khác
  // chỉ có thể rút ngắn lượt nói, không kéo dài buổi luyện ra được.
  return Math.min(plannedMs, spokenMs);
}

export function getSyncedTimeline(turns, practiceStartLocalTime, now, earlyTurnEnds = null) {
  if (!Array.isArray(turns) || turns.length === 0 || !Number.isFinite(practiceStartLocalTime)) {
    return null;
  }

  const elapsedMs = Math.max(0, now - practiceStartLocalTime);
  let stepStartOffsetMs = 0;

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turn = turns[turnIndex];
    const prepDurationMs = Number(turn.prepDurationMs) || 0;
    const speakDurationMs = getEffectiveSpeakDurationMs(turn, turnIndex, earlyTurnEnds);

    // Kể cả lượt đầu tiên. Trước đây lượt 0 bị loại trừ, nên người mở màn cả
    // buổi bị đẩy thẳng vào câu hỏi mà không có lấy một giây để đọc — đúng cái
    // bất lợi mà khoảng chờ sinh ra để xoá, mà lại rơi vào người bất lợi nhất:
    // người chưa quen nhịp buổi luyện.
    if (prepDurationMs === 0) {
      const gapMs = getTurnGapMs(turns, turnIndex);
      const gapEndOffsetMs = stepStartOffsetMs + gapMs;
      if (elapsedMs < gapEndOffsetMs) {
        return {
          phase: 'transition',
          turnIndex,
          gapMs,
          isSpeakerChange: gapMs === SPEAKER_CHANGE_GAP_MS,
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
