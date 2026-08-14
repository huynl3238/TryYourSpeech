import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  detectAudioFormat,
  inspectAudioFile,
  isSupportedAudioUploadMimeType,
} from '../src/services/audioFormat.js';

test('detectAudioFormat recognizes WebM, MP4, Ogg, and WAV signatures', () => {
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]);
  const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypmp42')]);
  const ogg = Buffer.from('OggS....');
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);

  assert.equal(detectAudioFormat(webm).extension, 'webm');
  assert.equal(detectAudioFormat(mp4).extension, 'mp4');
  assert.equal(detectAudioFormat(ogg).extension, 'ogg');
  assert.equal(detectAudioFormat(wav).extension, 'wav');
  assert.equal(detectAudioFormat(Buffer.from('not audio')), null);
});

test('upload MIME validation accepts iPhone MP4 and desktop WebM', () => {
  assert.equal(isSupportedAudioUploadMimeType('audio/mp4'), true);
  assert.equal(isSupportedAudioUploadMimeType('audio/webm;codecs=opus'), true);
  assert.equal(isSupportedAudioUploadMimeType('audio/ogg'), true);
  assert.equal(isSupportedAudioUploadMimeType('text/plain'), false);
});

test('inspectAudioFile detects an old MP4 recording even when its name ends in .webm', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'audio-format-'));
  const filePath = join(directory, 'old-iphone-recording.webm');

  try {
    await writeFile(filePath, Buffer.concat([Buffer.alloc(4), Buffer.from('ftypmp42')]));
    assert.deepEqual(await inspectAudioFile(filePath), {
      extension: 'mp4',
      contentType: 'audio/mp4',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
