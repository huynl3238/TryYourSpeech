import assert from 'node:assert/strict';
import test from 'node:test';
import { maybeStartSessionProcessing } from '../src/models/processingModel.js';

function createClient(handler) {
  const calls = [];

  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return handler(sql, params);
    },
  };
}

test('maybeStartSessionProcessing stays pending until both reviews are complete', async () => {
  const client = createClient((sql) => {
    if (sql.includes('SELECT user_a_review_done_at')) {
      return {
        rows: [{ user_a_review_done_at: new Date(), user_b_review_done_at: null }],
      };
    }

    throw new Error('processing should stop before checking audio');
  });

  const status = await maybeStartSessionProcessing(client, 'session-1');

  assert.equal(status, 'pending');
});

test('maybeStartSessionProcessing stays pending until all audio is uploaded', async () => {
  const client = createClient((sql) => {
    if (sql.includes('SELECT user_a_review_done_at')) {
      return {
        rows: [{ user_a_review_done_at: new Date(), user_b_review_done_at: new Date() }],
      };
    }

    if (sql.includes('pending_count')) {
      return { rows: [{ pending_count: 1 }] };
    }

    throw new Error('processing should stop before creating AI results');
  });

  const status = await maybeStartSessionProcessing(client, 'session-1');

  assert.equal(status, 'pending');
});

test('maybeStartSessionProcessing creates AI results, fails scaffold, and completes terminal session', async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.AZURE_SPEECH_KEY;
  delete process.env.AZURE_SPEECH_REGION;
  delete process.env.GEMINI_API_KEY;

  let completionAttempts = 0;
  const client = createClient((sql) => {
    if (sql.includes('SELECT user_a_review_done_at')) {
      return {
        rows: [{ user_a_review_done_at: new Date(), user_b_review_done_at: new Date() }],
      };
    }

    if (sql.includes('pending_count')) {
      return { rows: [{ pending_count: 0 }] };
    }

    if (sql.includes('SELECT id') && sql.includes('upload_status =')) {
      return { rows: [{ id: 'turn-1' }] };
    }

    if (sql.includes('SELECT') && sql.includes('json_agg')) {
      return { rows: [{ turn_id: 'turn-1', peer_notes: [] }] };
    }

    if (sql.includes('UPDATE sessions') && sql.includes('RETURNING status')) {
      completionAttempts += 1;
      return { rows: [{ status: 'completed' }], rowCount: 1 };
    }

    return { rows: [], rowCount: 1 };
  });

  const status = await maybeStartSessionProcessing(client, 'session-1');
  const failedUpdates = client.calls.filter((call) => call.sql.includes('UPDATE ai_results'));

  assert.equal(status, 'failed');
  assert.equal(failedUpdates.length, 1);
  assert.equal(completionAttempts, 1);
});
