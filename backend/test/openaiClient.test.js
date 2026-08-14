import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { transcribeAudioFile } from '../src/services/openaiClient.js';

test('transcribeAudioFile sends WAV metadata and reads the JSON transcript contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openai-audio-'));
  const filePath = join(directory, 'turn.wav');
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;

  try {
    await writeFile(filePath, Buffer.from('RIFF0000WAVE'));
    process.env.OPENAI_API_KEY = 'test-key';

    globalThis.fetch = async (_url, options) => {
      const uploadedFile = options.body.get('file');
      assert.equal(uploadedFile.name, 'turn.wav');
      assert.equal(uploadedFile.type, 'audio/wav');
      assert.equal(options.body.get('response_format'), 'json');

      return new Response(JSON.stringify({ text: '  I am studying.  ' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    assert.equal(
      await transcribeAudioFile({ filePath, model: 'gpt-4o-transcribe', language: 'en' }),
      'I am studying.'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
