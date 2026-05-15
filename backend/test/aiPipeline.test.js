import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAiConfigStatus,
  prepareAiPipeline,
} from '../src/models/aiPipelineModel.js';

const AI_ENV_NAMES = [
  'OPENAI_API_KEY',
  'AZURE_SPEECH_KEY',
  'AZURE_SPEECH_REGION',
  'GEMINI_API_KEY',
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

test('getAiConfigStatus reports missing names without exposing values', () => {
  clearAiEnv();
  process.env.OPENAI_API_KEY = 'secret-value';

  const status = getAiConfigStatus();

  assert.equal(status.ok, false);
  assert.deepEqual(status.configured, ['OPENAI_API_KEY']);
  assert.deepEqual(status.missing, [
    'AZURE_SPEECH_KEY',
    'AZURE_SPEECH_REGION',
    'GEMINI_API_KEY',
  ]);
  assert.equal(JSON.stringify(status).includes('secret-value'), false);

  clearAiEnv();
});

test('prepareAiPipeline runs turn scaffold and stores placeholder failure', async () => {
  setAiEnv();

  const client = createPipelineClient([
    {
      turn_id: 'turn-1',
      audio_url: '/uploads/audio/turn-1.webm',
      question_text: 'Question?',
      peer_notes: [],
    },
  ]);

  const result = await prepareAiPipeline(client, 'session-1');
  const update = client.calls.find((call) => call.sql.includes('UPDATE ai_results'));

  assert.equal(result.status, 'failed');
  assert.equal(result.processedTurns, 1);
  assert.match(update.params[1], /Transcription step is not implemented yet/);

  clearAiEnv();
});
