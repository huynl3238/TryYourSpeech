import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAudioFileExtension,
  getRecorderOutputMimeType,
  getSupportedRecorderMimeType,
} from './audioFormat.js';

test('selects MP4 when an iPhone-style MediaRecorder cannot create WebM', () => {
  const Recorder = {
    isTypeSupported(type) {
      return type === 'audio/mp4';
    },
  };

  assert.equal(getSupportedRecorderMimeType(Recorder), 'audio/mp4');
});

test('maps recorder MIME types to matching upload extensions', () => {
  assert.equal(getAudioFileExtension('audio/webm;codecs=opus'), 'webm');
  assert.equal(getAudioFileExtension('audio/mp4'), 'mp4');
  assert.equal(getAudioFileExtension('audio/ogg;codecs=opus'), 'ogg');
  assert.equal(getAudioFileExtension('audio/mpeg'), '');
});

test('keeps the recorder output type instead of forcing WebM', () => {
  const recorder = { mimeType: 'audio/mp4' };
  const chunks = [{ type: 'audio/mp4' }];

  assert.equal(
    getRecorderOutputMimeType(recorder, chunks, 'audio/webm;codecs=opus'),
    'audio/mp4'
  );
});
