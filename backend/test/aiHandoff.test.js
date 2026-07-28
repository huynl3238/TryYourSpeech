import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
import { createMatchedSession, markSessionActive } from '../src/models/sessionModel.js';
import { completeReview } from '../src/models/reviewModel.js';
import { getSessionStatus } from '../src/models/sessionLifecycleModel.js';
import { runSessionAiPipeline } from '../src/models/processingModel.js';

// AI is deliberately left unconfigured, so the "grading" is the failure path:
// fast, free, and still exercising the hand-off, the background run and the
// session-completion logic for real.
delete process.env.OPENAI_API_KEY;
delete process.env.AZURE_SPEECH_KEY;
delete process.env.AZURE_SPEECH_REGION;

async function canUseDatabase() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function createUser(displayName, band) {
  const result = await pool.query(
    `
      INSERT INTO users (id, display_name, band, user_role)
      VALUES (gen_random_uuid(), $1, $2, 'student')
      RETURNING id
    `,
    [displayName, band]
  );

  return result.rows[0].id;
}

async function cleanup(session) {
  if (!session) return;

  await pool.query(
    'DELETE FROM ai_results WHERE turn_id IN (SELECT id FROM turns WHERE session_id = $1)',
    [session.sessionId]
  );
  await pool.query('DELETE FROM session_ai_results WHERE session_id = $1', [session.sessionId]);
  await pool.query('DELETE FROM turns WHERE session_id = $1', [session.sessionId]);
  await pool.query('DELETE FROM sessions WHERE id = $1', [session.sessionId]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [session.userA.id, session.userB.id]);
}

// Generous timeout on purpose: test files run in parallel and one of the others
// re-runs schema.sql, whose ALTER TABLEs can briefly block these queries.
async function waitForStatus(sessionId, expected, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await getSessionStatus(pool, sessionId);
    if (status === expected) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return await getSessionStatus(pool, sessionId);
}

async function markEveryTurnUploaded(sessionId) {
  await pool.query(
    `
      UPDATE turns
      SET upload_status = 'uploaded', audio_url = '/uploads/audio/' || id || '.webm'
      WHERE session_id = $1
    `,
    [sessionId]
  );
}

test('finishing review hands AI grading off and returns without doing it', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let session = null;

  try {
    session = await createMatchedSession(
      `ai-handoff-${randomUUID().slice(0, 8)}`,
      { userId: await createUser('Handoff A', 6.5), band: 6.5 },
      { userId: await createUser('Handoff B', 6), band: 6 }
    );
    await markSessionActive(session.sessionId);
    await markEveryTurnUploaded(session.sessionId);

    await completeReview({ sessionId: session.sessionId, userId: session.userA.id });
    const second = await completeReview({ sessionId: session.sessionId, userId: session.userB.id });

    // The request itself must not have graded anything: it returns as soon as the
    // session is claimed, which is why the status is not terminal yet.
    assert.equal(second.bothCompleted, true);
    assert.equal(second.sessionStatus, 'processing');

    // ...and the work still gets done, by the background runner nobody awaited.
    assert.equal(await waitForStatus(session.sessionId, 'completed'), 'completed');

    const results = await pool.query(
      `
        SELECT ar.status
        FROM ai_results ar
        JOIN turns tr ON tr.id = ar.turn_id
        WHERE tr.session_id = $1
      `,
      [session.sessionId]
    );
    assert.equal(results.rows.length, 6);
    assert.ok(
      results.rows.every((row) => row.status === 'failed'),
      'AI chưa cấu hình nên mọi lượt phải được ghi là failed, không treo ở processing'
    );
  } finally {
    await cleanup(session);
  }
});

// Two callers reaching the same session is normal: the recovery sweep can overlap
// a fresh hand-off. Only one of them may actually spend money on grading.
test('two runs racing for one session grade it exactly once', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let session = null;

  try {
    session = await createMatchedSession(
      `ai-once-${randomUUID().slice(0, 8)}`,
      { userId: await createUser('Once A', 6.5), band: 6.5 },
      { userId: await createUser('Once B', 6), band: 6 }
    );
    await markSessionActive(session.sessionId);
    await markEveryTurnUploaded(session.sessionId);

    // Claim the session the way the request path does, without the hand-off, so
    // the race below is between the two explicit runs and nothing else.
    await pool.query("UPDATE sessions SET status = 'processing' WHERE id = $1", [session.sessionId]);
    await pool.query(
      `
        INSERT INTO ai_results (id, turn_id, status)
        SELECT gen_random_uuid(), id, 'processing' FROM turns WHERE session_id = $1
      `,
      [session.sessionId]
    );

    const [first, second] = await Promise.all([
      runSessionAiPipeline(session.sessionId),
      runSessionAiPipeline(session.sessionId),
    ]);

    const ranCount = [first, second].filter((result) => result.ran).length;
    assert.equal(ranCount, 1, 'chỉ một lần chấm được phép chạy');

    // Whichever lost, it must have said why rather than silently doing nothing.
    const loser = first.ran ? second : first;
    assert.ok(
      loser.skipped === 'already-running' || loser.skipped?.startsWith('status-'),
      `lý do bỏ qua không hợp lệ: ${loser.skipped}`
    );
  } finally {
    await cleanup(session);
  }
});
