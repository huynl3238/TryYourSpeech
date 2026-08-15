import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampAudioTime,
  formatAudioTime,
  getPlayableDuration,
  shouldProbeDuration,
} from './audioPlayer.js';

test('uses real audio metadata when Safari provides a finite duration', () => {
  assert.equal(getPlayableDuration(119.4, 120000), 119.4);
});

test('falls back to the planned turn length when media duration is invalid', () => {
  assert.equal(getPlayableDuration(Infinity, 120000), 120);
  assert.equal(getPlayableDuration(Number.NaN, 45000), 45);
  assert.equal(getPlayableDuration(Number.MAX_VALUE, 120000), 120);
});

test('playback progress never moves outside the visible timeline', () => {
  assert.equal(clampAudioTime(-3, 120), 0);
  assert.equal(clampAudioTime(42.5, 120), 42.5);
  assert.equal(clampAudioTime(150, 120), 120);
});

test('formats audio time consistently', () => {
  assert.equal(formatAudioTime(0), '0:00');
  assert.equal(formatAudioTime(69.9), '1:09');
});

// --- Dò độ dài thật của bản ghi ---
//
// File do trình duyệt ghi không mang độ dài trong phần đầu, nên `audio.duration`
// là vô cực cho tới khi đọc hết file. Thanh tiến độ khi đó phải mượn thời lượng
// dự kiến của lượt nói — mà nếu người nói bấm kết thúc sớm thì hai con số lệch
// nhau rất xa. Dò một lần là cách lấy được con số thật.

test('chỉ dò khi con số trình duyệt đưa ra không dùng được', () => {
  assert.equal(shouldProbeDuration(Infinity, 'idle'), true);
  assert.equal(shouldProbeDuration(Number.NaN, 'idle'), true);
  assert.equal(shouldProbeDuration(0, 'idle'), true);
  assert.equal(shouldProbeDuration(undefined, 'idle'), true);

  // Đã đọc được độ dài thì không việc gì phải tua đi tua lại.
  assert.equal(shouldProbeDuration(21.7, 'idle'), false);
});

test('không bao giờ dò lần thứ hai', () => {
  // Đây là chốt chặn quan trọng nhất: mỗi lần dò lại làm trình duyệt báo độ dài
  // một lần nữa, và nếu lần báo đó lại kích hoạt dò thì thành vòng lặp vô tận.
  assert.equal(shouldProbeDuration(Infinity, 'probing'), false);
  assert.equal(shouldProbeDuration(Infinity, 'done'), false);
});

test('lượt kết thúc sớm dùng độ dài thật, không dùng độ dài dự kiến', () => {
  // Lượt Part 2 dài 120 giây nhưng người nói bấm xong ở giây 22. Khi đã dò ra
  // được 22 giây thì thanh tiến độ phải theo con số đó.
  assert.equal(getPlayableDuration(22.1, 120000), 22.1);
  // Và khi màn Review đưa thẳng con số thật xuống, phần dự phòng cũng đúng.
  assert.equal(getPlayableDuration(Infinity, 22000), 22);
});
