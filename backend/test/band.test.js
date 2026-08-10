import assert from 'node:assert/strict';
import test from 'node:test';
import { isBandOmitted, parseBand, parseBandOrThrow } from '../src/utils/band.js';

// Band là đầu vào của ghép cặp và là con số người dùng tự khai. Giao diện dùng
// thanh trượt step=0.5 nên người dùng bình thường không gửi được giá trị lệch —
// nhưng gọi thẳng API thì gửi được, và trước bản này backend nhận hết.
//
// Hai lỗi cụ thể mấy bài dưới đây khoá lại:
//   1. band = 6.3 được nhận (không có chỗ nào chặn bước 0.5)
//   2. band = null biến thành band 0, vì Number(null) === 0

test('nhận đúng các mức nửa điểm', () => {
  for (const value of [0, 0.5, 4, 5.5, 6, 6.5, 7, 8.5, 9]) {
    assert.deepEqual(parseBand(value), { band: value }, `phải nhận ${value}`);
  }
});

test('từ chối band không phải mức 0.5', () => {
  for (const value of [6.3, 6.1, 5.75, 0.25, 8.9]) {
    const result = parseBand(value);
    assert.ok(result.error, `${value} phải bị từ chối`);
    assert.match(result.error, /0\.5/);
  }
});

test('từ chối band ngoài khoảng 0 đến 9', () => {
  for (const value of [-1, -0.5, 9.5, 10, 100]) {
    assert.ok(parseBand(value).error, `${value} phải bị từ chối`);
  }
});

test('band không khai là hợp lệ, và KHÔNG được thành 0', () => {
  for (const value of [null, undefined, '', '   ']) {
    assert.deepEqual(parseBand(value), { omitted: true });
    assert.ok(isBandOmitted(value));
  }

  // Đây đúng là lỗi cũ: Number(null) === 0 nên band null lặng lẽ thành band 0.
  assert.notEqual(parseBand(null).band, 0);
  assert.equal(parseBandOrThrow(null), null);
});

test('những kiểu mà Number() lặng lẽ đổi thành 0 đều bị từ chối', () => {
  // Number([]) === 0, Number(false) === 0. Nếu chỉ dựa vào Number.isFinite thì cả
  // hai đều lọt qua và thành band 0.
  for (const value of [[], false, true, {}, [6.5]]) {
    assert.ok(parseBand(value).error, `${JSON.stringify(value)} phải bị từ chối`);
  }
});

test('chuỗi số hợp lệ vẫn nhận, chuỗi rác thì không', () => {
  assert.deepEqual(parseBand('6.5'), { band: 6.5 });
  assert.deepEqual(parseBand(' 7 '), { band: 7 });
  for (const value of ['sáu', '6,5', '6.5abc', 'NaN', 'Infinity']) {
    assert.ok(parseBand(value).error, `"${value}" phải bị từ chối`);
  }
});

test('parseBandOrThrow ném lỗi khi sai, và khi bắt buộc mà không khai', () => {
  assert.throws(() => parseBandOrThrow(6.3), /0\.5/);
  assert.throws(() => parseBandOrThrow(10), /0–9/);
  assert.throws(() => parseBandOrThrow(null, { required: true }), /bắt buộc/);

  // Không bắt buộc thì "chưa khai" trả về null, không ném lỗi.
  assert.equal(parseBandOrThrow(''), null);
  assert.equal(parseBandOrThrow(6.5), 6.5);
});
