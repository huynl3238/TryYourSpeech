import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSyncedTimeline,
  getTurnBlockPosition,
  getTurnGapMs,
  NEXT_QUESTION_GAP_MS,
  SPEAKER_CHANGE_GAP_MS,
} from './sessionTimeline.js';

// Hàm này là toàn bộ đồng hồ của một phiên luyện, và hai máy chạy nó độc lập
// rồi tin vào kết quả của chính mình. Nên sai số ở đây không hiện ra như một
// lỗi: nó hiện ra như hai người nói chồng lên nhau, hoặc một người bị cắt giữa
// câu — và lệch tích lũy qua từng lượt nên càng về cuối càng nặng. Vì vậy mọi
// mốc dưới đây đều là số tuyệt đối, không tính lại bằng chính công thức đang
// kiểm tra.

const PRACTICE_START = 1_000_000;

// Một đề rút gọn theo đúng bố cục thật: mỗi người nói hết cả part rồi mới đổi
// lượt, và người mở màn luân phiên theo từng part (Part 1 mở bằng A, Part 2 mở
// bằng B). Part 2 có 60 giây đọc cue card nên không có khoảng chờ.
const TURNS = [
  { id: 't0', partNumber: 1, speakerRole: 'A', durationMs: 45000, prepDurationMs: 0 },
  { id: 't1', partNumber: 1, speakerRole: 'A', durationMs: 45000, prepDurationMs: 0 },
  { id: 't2', partNumber: 1, speakerRole: 'B', durationMs: 45000, prepDurationMs: 0 },
  { id: 't3', partNumber: 1, speakerRole: 'B', durationMs: 45000, prepDurationMs: 0 },
  { id: 't4', partNumber: 2, speakerRole: 'B', durationMs: 120000, prepDurationMs: 60000 },
  { id: 't5', partNumber: 2, speakerRole: 'A', durationMs: 120000, prepDurationMs: 60000 },
  { id: 't6', partNumber: 3, speakerRole: 'A', durationMs: 60000, prepDurationMs: 0 },
  { id: 't7', partNumber: 3, speakerRole: 'B', durationMs: 60000, prepDurationMs: 0 },
];

function at(elapsedMs) {
  return getSyncedTimeline(TURNS, PRACTICE_START, PRACTICE_START + elapsedMs);
}

test('người mở màn cũng được đọc câu hỏi trước khi đồng hồ chạy', () => {
  // Trước đây lượt đầu tiên bị loại khỏi khoảng chờ, nên người nói đầu buổi bị
  // đẩy thẳng vào câu hỏi: chưa đọc xong đề thì đã đang bị ghi âm.
  const start = at(0);

  assert.equal(start.phase, 'transition', 'phải có khoảng đọc đề ngay từ lượt đầu');
  assert.equal(start.turnIndex, 0);
  assert.equal(start.isSpeakerChange, true, 'mở màn cũng là một lần nhận vai');
});

test('cùng người sang câu tiếp thì chờ ngắn, đổi người thì chờ dài', () => {
  // Hai tình huống khác nhau nên không được dùng chung một con số: sang câu
  // tiếp chỉ cần đọc đề, còn đổi người thì phải kịp báo đổi vai và chuyển mic.
  assert.equal(getTurnGapMs(TURNS, 1), NEXT_QUESTION_GAP_MS, 'A nói tiếp câu của mình');
  assert.equal(getTurnGapMs(TURNS, 2), SPEAKER_CHANGE_GAP_MS, 'sang lượt của B');
  assert.equal(getTurnGapMs(TURNS, 3), NEXT_QUESTION_GAP_MS, 'B nói tiếp câu của mình');

  assert.equal(SPEAKER_CHANGE_GAP_MS, 8000, 'đổi số này là đổi nhịp cả phiên, phải cố ý');
  assert.equal(NEXT_QUESTION_GAP_MS, 5000);
});

test('lượt có thời gian chuẩn bị thì không chèn thêm khoảng chờ', () => {
  // Part 2 đã có 60 giây đọc cue card, cộng thêm khoảng chờ vào nữa là dư một
  // đoạn chết. Hai thứ này thay thế nhau chứ không cộng vào nhau — và đó chính
  // là lý do không dùng `prepDurationMs` để làm thời gian đọc đề cho Part 1:
  // bật nó lên là mất luôn khoảng chờ.
  const part1Ends = 8000 + 45000 + 5000 + 45000 + 8000 + 45000 + 5000 + 45000;

  const prep = at(part1Ends);
  assert.equal(prep.phase, 'prep', 'hết Part 1 là vào thẳng màn chuẩn bị Part 2');
  assert.equal(prep.turnIndex, 4);
});

test('mọi mốc của cả phiên khớp đúng từng mili giây', () => {
  // Mốc tính tay theo thứ tự: đổi người 8s → A nói 45s → câu tiếp 5s → A nói
  // 45s → đổi người 8s → B nói 45s → câu tiếp 5s → B nói 45s → chuẩn bị 60s →
  // B nói 120s → chuẩn bị 60s → A nói 120s → đổi người 8s → A nói 60s →
  // đổi người 8s → B nói 60s. Đây là bảng mà cả hai máy phải cùng suy ra.
  const expected = [
    [0, 'transition', 0],
    [7999, 'transition', 0],
    [8000, 'speaking', 0],
    [52999, 'speaking', 0],
    [53000, 'transition', 1],
    [58000, 'speaking', 1],
    [103000, 'transition', 2],
    [111000, 'speaking', 2],
    [156000, 'transition', 3],
    [161000, 'speaking', 3],
    [206000, 'prep', 4],
    [266000, 'speaking', 4],
    [386000, 'prep', 5],
    [446000, 'speaking', 5],
    [566000, 'transition', 6],
    [574000, 'speaking', 6],
    [634000, 'transition', 7],
    [642000, 'speaking', 7],
  ];

  for (const [elapsedMs, phase, turnIndex] of expected) {
    const step = at(elapsedMs);
    assert.equal(step.phase, phase, `tại ${elapsedMs}ms phải là ${phase}, thực tế ${step.phase}`);
    assert.equal(step.turnIndex, turnIndex, `tại ${elapsedMs}ms phải ở lượt ${turnIndex}`);
  }
});

test('mốc bắt đầu của mỗi bước là giờ tuyệt đối, không phải khoảng lệch', () => {
  // Màn chuyển lượt lấy số đếm ngược từ mốc này. Trả về khoảng lệch thay vì giờ
  // tuyệt đối thì đồng hồ đếm ngược sẽ nhảy lung tung mà không ai thấy sai ở
  // đâu, vì các phase vẫn chuyển đúng.
  const step = at(55000);

  assert.equal(step.stepStartedAtMs, PRACTICE_START + 53000);
});

test('hết lượt cuối thì phiên kết thúc, không kẹt ở lượt nào', () => {
  const done = at(642000 + 60000);

  assert.equal(done.phase, 'complete');
  assert.equal(done.isComplete, true);
  assert.equal(done.turnIndex, TURNS.length);
});

test('vị trí câu đếm trong khối của chính mình, không phải cả buổi', () => {
  // Người nói cần biết "câu 2 trong 2 câu của tôi", không phải "lượt 4/8".
  assert.deepEqual(getTurnBlockPosition(TURNS, 0), { position: 1, total: 2 });
  assert.deepEqual(getTurnBlockPosition(TURNS, 1), { position: 2, total: 2 });
  assert.deepEqual(getTurnBlockPosition(TURNS, 2), { position: 1, total: 2 }, 'khối của B bắt đầu đếm lại');
});

test('khối không được dính sang part kế tiếp dù cùng một người', () => {
  // B chốt Part 1 rồi mở luôn Part 2 — hệ quả tất yếu của việc luân phiên người
  // mở màn. Nếu chỉ so người mà không so part thì hai khối này dính thành một,
  // và màn hình sẽ báo "câu 3/3" cho một cue card đứng riêng.
  assert.deepEqual(getTurnBlockPosition(TURNS, 3), { position: 2, total: 2 }, 'vẫn thuộc Part 1');
  assert.deepEqual(getTurnBlockPosition(TURNS, 4), { position: 1, total: 1 }, 'Part 2 là khối riêng');
});

test('chưa có mốc bắt đầu thì không đoán bừa', () => {
  // Người vào phiên trước khi `practice_start` về thì chưa có gì để tính. Đoán
  // bừa một mốc ở đây là cho một máy chạy trước máy kia.
  assert.equal(getSyncedTimeline(TURNS, NaN, 0), null);
  assert.equal(getSyncedTimeline([], PRACTICE_START, PRACTICE_START), null);
});
