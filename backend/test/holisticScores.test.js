import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHolisticScores } from '../src/models/aiPipelineModel.js';

// Khoá lại quyết định ngày 09/08/2026: band tổng chỉ gồm BA tiêu chí ngôn ngữ,
// không có phát âm.
//
// Cơ sở của quyết định — đo trên 5 bài mẫu có band tham chiếu:
//
//   band thật    4.5   5.5   6.5   7.5   9.0
//   phát âm      7.0   7.5   7.5   7.5   7.5   ← gần như hằng số
//
// Điểm phát âm quy từ Azure ra band không phân biệt được trình độ, nên cộng nó vào
// band tổng chỉ làm sai lệch: tỉ lệ chấm nằm trong 0.5 band là 40% khi có phát âm,
// 80% khi bỏ ra. Bảng quy đổi tự đặt đó đã bị xoá khỏi hệ thống.
//
// Vì sao khoá ở đây mà không khoá ở computeOverallBand: hàm đó chỉ lấy trung bình
// những gì được đưa vào, nên nếu ai đó thêm phát âm trở lại vào `scores` thì nó sẽ
// âm thầm bị cộng vào band tổng và không test nào đỏ.

test('band tổng chỉ gồm ba tiêu chí ngôn ngữ', () => {
  const scores = buildHolisticScores({
    scores: { fluency: 7, lexical: 6.5, grammar: 6 },
  });

  assert.deepEqual(Object.keys(scores).sort(), ['fluency', 'grammar', 'lexical']);
  assert.equal(scores.fluency, 7);
  assert.equal(scores.lexical, 6.5);
  assert.equal(scores.grammar, 6);
});

test('phát âm bị loại ra kể cả khi mô hình có trả về', () => {
  const scores = buildHolisticScores({
    scores: { fluency: 7, lexical: 7, grammar: 7, pronunciation: 7.5 },
  });

  assert.equal(
    'pronunciation' in scores,
    false,
    'phát âm không được nằm trong band tổng — xem lý do ở đầu file'
  );
  assert.equal(Object.keys(scores).length, 3);
});

test('tiêu chí thiếu thì là null, không phải 0', () => {
  // 0 sẽ bị tính vào trung bình và dìm band tổng xuống; null bị lọc bỏ.
  const scores = buildHolisticScores({ scores: { fluency: 6 } });

  assert.equal(scores.fluency, 6);
  assert.equal(scores.lexical, null);
  assert.equal(scores.grammar, null);
});

test('không có gì cũng không nổ', () => {
  assert.deepEqual(buildHolisticScores(undefined), {
    fluency: null,
    lexical: null,
    grammar: null,
  });
  assert.deepEqual(buildHolisticScores({}), {
    fluency: null,
    lexical: null,
    grammar: null,
  });
});
