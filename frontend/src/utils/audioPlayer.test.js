import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampAudioTime,
  formatAudioTime,
  getPlayableDuration,
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
