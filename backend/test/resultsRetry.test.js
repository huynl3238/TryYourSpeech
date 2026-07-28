import assert from 'node:assert/strict';
import test from 'node:test';
import pool from '../src/config/db.js';
import { retryFailedResults } from '../src/models/resultsModel.js';

// Retry claims the session (reset + status) and hands grading off to the
// background runner, exactly like the first attempt does.
test('retryFailedResults resets failed turns and hands grading off', async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.AZURE_SPEECH_KEY;
  delete process.env.AZURE_SPEECH_REGION;

  const originalConnect = pool.connect;
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });

      if (sql.includes('FROM sessions') && sql.includes('user_a_id')) {
        return {
          rows: [{
            id: 'session-1',
            user_a_id: 'user-1',
            user_b_id: 'user-2',
            status: 'completed',
          }],
        };
      }

      if (sql.includes('FROM turns tr') && sql.includes("ar.status = 'failed'")) {
        return { rows: [{ id: 'turn-1' }] };
      }

      if (sql.includes('SELECT') && sql.includes('json_agg')) {
        return { rows: [{ turn_id: 'turn-1', peer_notes: [] }] };
      }

      if (sql.includes('UPDATE sessions') && sql.includes('RETURNING status')) {
        return { rows: [{ status: 'completed' }], rowCount: 1 };
      }

      if (sql.includes('SELECT status')) {
        return { rows: [{ status: 'processing' }] };
      }

      // The background runner shares this mocked connection; refusing the lock
      // makes it bow out instead of grading inside the test.
      if (sql.includes('pg_try_advisory_lock')) {
        return { rows: [{ acquired: false }] };
      }

      return { rows: [], rowCount: 1 };
    },
    release() {},
  };

  pool.connect = async () => client;

  try {
    const result = await retryFailedResults({
      sessionId: 'session-1',
      userId: 'user-1',
    });
    const resetCall = calls.find((call) => (
      call.sql.includes("SET status = 'processing'") &&
      call.sql.includes('whisper_transcript = NULL')
    ));
    assert.equal(result.aiStatus, 'processing');
    assert.equal(result.sessionStatus, 'processing');
    assert.ok(resetCall, 'phải xoá kết quả cũ để chấm lại');
    assert.equal(
      calls.some((call) => call.sql.includes('json_agg')),
      false,
      'không được chấm AI trong transaction của request'
    );
  } finally {
    pool.connect = originalConnect;
  }
});
