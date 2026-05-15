import assert from 'node:assert/strict';
import test from 'node:test';
import pool from '../src/config/db.js';
import { retryFailedResults } from '../src/models/resultsModel.js';

test('retryFailedResults resets failed turns and reruns AI scaffold', async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.AZURE_SPEECH_KEY;
  delete process.env.AZURE_SPEECH_REGION;
  delete process.env.GEMINI_API_KEY;

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
    const failedCall = calls.find((call) => (
      call.sql.includes("SET status = 'failed'") &&
      call.params?.[0] === 'turn-1'
    ));

    assert.equal(result.retried, 1);
    assert.equal(result.aiStatus, 'failed');
    assert.equal(result.sessionStatus, 'completed');
    assert.ok(resetCall);
    assert.ok(failedCall);
  } finally {
    pool.connect = originalConnect;
  }
});
