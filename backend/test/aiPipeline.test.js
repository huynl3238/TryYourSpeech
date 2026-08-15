import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAiConfigStatus,
  prepareAiPipeline,
  runOptionalPronunciationAssessment,
  runSpeakerPipelinesConcurrently,
  runTurnAiServices,
} from '../src/models/aiPipelineModel.js';

const AI_ENV_NAMES = [
  'OPENAI_API_KEY',
  'AZURE_SPEECH_KEY',
  'AZURE_SPEECH_REGION',
];

function clearAiEnv() {
  for (const name of AI_ENV_NAMES) {
    delete process.env[name];
  }
}

function setAiEnv() {
  for (const name of AI_ENV_NAMES) {
    process.env[name] = 'test';
  }
}

function createPipelineClient(turns) {
  const calls = [];
  const client = {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });

      if (sql.includes('SELECT') && sql.includes('json_agg')) {
        return { rows: turns };
      }

      return { rows: [], rowCount: 1 };
    },
  };

  return client;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

test('transcription and pronunciation start together and keep their original results', async () => {
  const transcription = createDeferred();
  const pronunciation = createDeferred();
  const started = [];

  const resultPromise = runTurnAiServices({
    transcribe: () => {
      started.push('transcription');
      return transcription.promise;
    },
    assess: () => {
      started.push('pronunciation');
      return pronunciation.promise;
    },
  });

  assert.deepEqual(started, ['transcription', 'pronunciation']);

  transcription.resolve('The original transcript');
  pronunciation.resolve({ pronunciationScore: 83, detail: [{ word: 'original' }] });

  assert.deepEqual(await resultPromise, {
    transcript: 'The original transcript',
    pronunciation: {
      pronunciationScore: 83,
      detail: [{ word: 'original' }],
    },
  });
});

test('a failed provider waits for the other provider before the WAV may be cleaned up', async () => {
  const pronunciation = createDeferred();
  const transcriptionError = new Error('transcription failed');
  let finished = false;

  const resultPromise = runTurnAiServices({
    transcribe: async () => {
      throw transcriptionError;
    },
    assess: () => pronunciation.promise,
  }).finally(() => {
    finished = true;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false);

  pronunciation.resolve({ pronunciationScore: 80 });
  await assert.rejects(resultPromise, transcriptionError);
  assert.equal(finished, true);
});

test('both speaker pipelines start together but an error waits for the other speaker', async () => {
  const speakerA = createDeferred();
  const speakerB = createDeferred();
  const started = [];
  let finished = false;
  const bySpeaker = new Map([
    ['speaker-a', [{ turn_id: 'turn-a' }]],
    ['speaker-b', [{ turn_id: 'turn-b' }]],
  ]);

  const resultPromise = runSpeakerPipelinesConcurrently(
    bySpeaker,
    async (speakerId) => {
      started.push(speakerId);
      return speakerId === 'speaker-a' ? speakerA.promise : speakerB.promise;
    }
  ).finally(() => {
    finished = true;
  });

  assert.deepEqual(started, ['speaker-a', 'speaker-b']);

  speakerA.reject(new Error('database unavailable'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false);

  speakerB.resolve(true);
  await assert.rejects(resultPromise, /database unavailable/);
  assert.equal(finished, true);
});

test('speaker results stay attached to the right user when they finish out of order', async () => {
  const speakerA = createDeferred();
  const speakerB = createDeferred();
  const bySpeaker = new Map([
    ['speaker-a', [{ turn_id: 'turn-a' }]],
    ['speaker-b', [{ turn_id: 'turn-b' }]],
  ]);

  const resultPromise = runSpeakerPipelinesConcurrently(
    bySpeaker,
    (speakerId) => speakerId === 'speaker-a' ? speakerA.promise : speakerB.promise
  );

  speakerB.resolve(false);
  speakerA.resolve(true);

  assert.deepEqual(await resultPromise, [
    { speakerId: 'speaker-a', completed: true },
    { speakerId: 'speaker-b', completed: false },
  ]);
});

test('prepareAiPipeline marks every processing turn failed when AI config is missing', async () => {
  clearAiEnv();

  const client = createPipelineClient([
    { turn_id: 'turn-1', peer_notes: [] },
    { turn_id: 'turn-2', peer_notes: [] },
  ]);

  const result = await prepareAiPipeline(client, 'session-1');
  const updates = client.calls.filter((call) => call.sql.includes('UPDATE ai_results'));

  assert.equal(result.status, 'failed');
  assert.equal(result.processedTurns, 2);
  assert.equal(updates.length, 2);
  assert.match(updates[0].params[1], /OPENAI_API_KEY/);
});

test('getAiConfigStatus keeps OpenAI scoring available when optional Azure is missing', () => {
  clearAiEnv();
  process.env.OPENAI_API_KEY = 'secret-value';

  const status = getAiConfigStatus();

  assert.equal(status.ok, true);
  assert.deepEqual(status.configured, ['OPENAI_API_KEY']);
  assert.deepEqual(status.missing, [
    'AZURE_SPEECH_KEY',
    'AZURE_SPEECH_REGION',
  ]);
  assert.equal(status.provider.transcription, 'openai');
  assert.equal(status.provider.pronunciation, 'unavailable');
  assert.equal(status.provider.feedback, 'openai');
  assert.equal(JSON.stringify(status).includes('secret-value'), false);

  clearAiEnv();
});

test('optional pronunciation failure does not fail the OpenAI scoring pipeline', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const missing = await runOptionalPronunciationAssessment({
      enabled: false,
      turnId: 'turn-1',
      assess: async () => {
        throw new Error('must not run');
      },
    });
    assert.equal(missing.unavailableReason, 'not_configured');

    const providerFailure = await runOptionalPronunciationAssessment({
      enabled: true,
      turnId: 'turn-2',
      assess: async () => {
        throw new Error('Azure is unavailable');
      },
    });
    assert.equal(providerFailure.unavailableReason, 'provider_error');
    assert.deepEqual(providerFailure.detail, []);
  } finally {
    console.warn = originalWarn;
  }
});

test('prepareAiPipeline runs the turn pipeline and records failure when audio is unavailable', async () => {
  setAiEnv();

  const client = createPipelineClient([
    {
      turn_id: 'turn-1',
      audio_url: '/uploads/audio/turn-1.webm',
      question_text: 'Question?',
      part_number: 1,
      peer_notes: [],
    },
  ]);

  const result = await prepareAiPipeline(client, 'session-1');
  const update = client.calls.find((call) => call.sql.includes('UPDATE ai_results'));

  // No audio file exists on disk in the test, so transcription fails before any
  // network call is made and the turn is marked failed with the error message.
  assert.equal(result.status, 'failed');
  assert.equal(result.processedTurns, 1);
  assert.equal(typeof update.params[1], 'string');
  assert.ok(update.params[1].length > 0);

  clearAiEnv();
});

test('prepareAiPipeline stops when the monthly assessment limit is reached', async () => {
  setAiEnv();
  process.env.AI_MONTHLY_ASSESSMENT_LIMIT = '5';

  const calls = [];
  const client = {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });

      if (sql.includes('date_trunc')) {
        return { rows: [{ count: 5 }] };
      }

      if (sql.includes('SELECT') && sql.includes('json_agg')) {
        return { rows: [{ turn_id: 'turn-1', peer_notes: [] }] };
      }

      return { rows: [], rowCount: 1 };
    },
  };

  const result = await prepareAiPipeline(client, 'session-1');
  const update = calls.find((call) => call.sql.includes('UPDATE ai_results'));

  assert.equal(result.status, 'failed');
  assert.match(update.params[1], /giới hạn chấm AI/);

  delete process.env.AI_MONTHLY_ASSESSMENT_LIMIT;
  clearAiEnv();
});
