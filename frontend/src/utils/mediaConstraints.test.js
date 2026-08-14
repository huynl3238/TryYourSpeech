import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSpeechMediaConstraints,
  markAudioTracksAsSpeech,
} from './mediaConstraints.js';

test('call media requests echo cancellation and speech cleanup', () => {
  const constraints = getSpeechMediaConstraints({
    getSupportedConstraints: () => ({ voiceIsolation: true }),
  });

  assert.deepEqual(constraints.audio.echoCancellation, { ideal: true });
  assert.deepEqual(constraints.audio.noiseSuppression, { ideal: true });
  assert.deepEqual(constraints.audio.autoGainControl, { ideal: true });
  assert.deepEqual(constraints.audio.voiceIsolation, { ideal: true });
});

test('voice isolation is omitted on browsers that do not support it', () => {
  const constraints = getSpeechMediaConstraints({
    getSupportedConstraints: () => ({}),
  });

  assert.equal('voiceIsolation' in constraints.audio, false);
});

test('captured audio tracks are marked as speech when supported', () => {
  const track = { contentHint: '' };
  markAudioTracksAsSpeech({ getAudioTracks: () => [track] });
  assert.equal(track.contentHint, 'speech');
});
