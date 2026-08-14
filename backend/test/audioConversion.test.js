import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import test from 'node:test';
import { convertAudioToWav } from '../src/services/audioConversion.js';
import { inspectAudioFile } from '../src/services/audioFormat.js';

const runFile = promisify(execFile);

test('convertAudioToWav decodes iPhone-style MP4 even when the old file has a .webm suffix', async (t) => {
  if (!ffmpegPath) {
    t.skip('ffmpeg-static is unavailable');
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), 'audio-conversion-'));
  const misnamedMp4Path = join(directory, 'iphone-recording.webm');
  const wavPath = join(directory, 'normalized.wav');

  try {
    await runFile(ffmpegPath, [
      '-f', 'lavfi',
      '-i', 'anullsrc=r=48000:cl=mono',
      '-t', '0.2',
      '-c:a', 'aac',
      '-f', 'mp4',
      misnamedMp4Path,
    ]);

    assert.equal((await inspectAudioFile(misnamedMp4Path)).extension, 'mp4');

    await convertAudioToWav(misnamedMp4Path, wavPath);
    assert.deepEqual(await inspectAudioFile(wavPath), {
      extension: 'wav',
      contentType: 'audio/wav',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
