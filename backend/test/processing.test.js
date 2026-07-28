import assert from 'node:assert/strict';
import test from 'node:test';
import {
  maybeStartSessionProcessing,
  runAiForClaimedSession,
} from '../src/models/processingModel.js';

// A real UUID: claiming a session schedules a background run against the actual
// pool, and a non-UUID id would make Postgres complain in the test output.
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

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
    if (sql.includes('SELECT session_mode')) {
      return { rows: [{ session_mode: 'peer' }] };
    }

    if (sql.includes('SELECT user_a_review_done_at')) {
      return {
        rows: [{ user_a_review_done_at: new Date(), user_b_review_done_at: null }],
      };
    }

    throw new Error('processing should stop before checking audio');
  });

  const status = await maybeStartSessionProcessing(client, SESSION_ID);

  assert.equal(status, 'pending');
});

test('maybeStartSessionProcessing stays pending until all audio is uploaded', async () => {
  const client = createClient((sql) => {
    if (sql.includes('SELECT session_mode')) {
      return { rows: [{ session_mode: 'peer' }] };
    }

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

  const status = await maybeStartSessionProcessing(client, SESSION_ID);

  assert.equal(status, 'pending');
});

// Claiming must be cheap: it records that the session is being graded and hands
// off. Grading inside the caller's transaction is what used to hold a database
// connection open for the length of the OpenAI and Azure calls.
test('maybeStartSessionProcessing claims the session without grading it', async () => {
  const client = createClient((sql) => {
    if (sql.includes('SELECT session_mode')) {
      return { rows: [{ session_mode: 'peer' }] };
    }

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

    // Not everything is terminal yet, so the session stays in 'processing' and
    // the background run takes over.
    if (sql.includes('UPDATE sessions') && sql.includes('RETURNING status')) {
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('SELECT status')) {
      return { rows: [{ status: 'processing' }] };
    }

    return { rows: [], rowCount: 1 };
  });

  const status = await maybeStartSessionProcessing(client, SESSION_ID);

  assert.equal(status, 'processing');
  assert.equal(
    client.calls.filter((call) => call.sql.includes('INSERT INTO ai_results')).length,
    1,
    'phải đặt chỗ kết quả AI cho lượt đã upload'
  );
  assert.equal(
    client.calls.some((call) => call.sql.includes('json_agg')),
    false,
    'không được chấm AI trong transaction của request'
  );
});

// A session whose audio all failed to upload has nothing to grade, so it should
// finish immediately rather than wait on a background run that would do nothing.
test('maybeStartSessionProcessing completes a session with nothing to grade', async () => {
  const client = createClient((sql) => {
    if (sql.includes('SELECT session_mode')) {
      return { rows: [{ session_mode: 'peer' }] };
    }

    if (sql.includes('SELECT user_a_review_done_at')) {
      return {
        rows: [{ user_a_review_done_at: new Date(), user_b_review_done_at: new Date() }],
      };
    }

    if (sql.includes('pending_count')) {
      return { rows: [{ pending_count: 0 }] };
    }

    if (sql.includes('SELECT id') && sql.includes('upload_status =')) {
      return { rows: [] };
    }

    if (sql.includes('UPDATE sessions') && sql.includes('RETURNING status')) {
      return { rows: [{ status: 'completed' }], rowCount: 1 };
    }

    return { rows: [], rowCount: 1 };
  });

  assert.equal(await maybeStartSessionProcessing(client, SESSION_ID), 'completed');
});

test('the background run marks turns failed when AI is not configured', async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.AZURE_SPEECH_KEY;
  delete process.env.AZURE_SPEECH_REGION;

  let completionAttempts = 0;
  const client = createClient((sql) => {
    if (sql.includes('SELECT status')) {
      return { rows: [{ status: 'processing' }] };
    }

    if (sql.includes('SELECT') && sql.includes('json_agg')) {
      return { rows: [{ turn_id: 'turn-1', speaker_id: 'user-1', peer_notes: [] }] };
    }

    if (sql.includes('UPDATE sessions') && sql.includes('RETURNING status')) {
      completionAttempts += 1;
      return { rows: [{ status: 'completed' }], rowCount: 1 };
    }

    return { rows: [], rowCount: 1 };
  });

  const result = await runAiForClaimedSession(client, SESSION_ID);
  const failedUpdates = client.calls.filter((call) => call.sql.includes('UPDATE ai_results'));

  assert.equal(result.status, 'failed');
  assert.equal(failedUpdates.length, 1);
  assert.equal(completionAttempts, 1);
});

// Guards against double grading: a recovery sweep and a fresh hand-off can both
// reach the same session.
test('the background run skips a session that is no longer processing', async () => {
  const client = createClient((sql) => {
    if (sql.includes('SELECT status')) {
      return { rows: [{ status: 'completed' }] };
    }

    throw new Error('không được chạm vào AI khi phiên đã kết thúc');
  });

  const result = await runAiForClaimedSession(client, SESSION_ID);

  assert.equal(result.skipped, 'status-completed');
  assert.equal(result.ran, undefined);
});

test('maybeStartSessionProcessing does not start AI for mentor sessions', async () => {
  const client = createClient((sql) => {
    if (sql.includes('SELECT session_mode')) {
      return { rows: [{ session_mode: 'mentor' }] };
    }

    throw new Error('mentor sessions should stop before review and audio checks');
  });

  const status = await maybeStartSessionProcessing(client, SESSION_ID);

  assert.equal(status, 'not_required');
});
