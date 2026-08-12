import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
import { createMatchedSession, markSessionActive } from '../src/models/sessionModel.js';
import { completeReview } from '../src/models/reviewModel.js';
import { getSessionStatus } from '../src/models/sessionLifecycleModel.js';
import { MAX_AI_ATTEMPTS, runSessionAiPipeline } from '../src/models/processingModel.js';

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
    // Mọi lượt của phiên phải có một dòng kết quả. Đếm từ bảng turns thay vì
    // ghim con số, để test không vỡ khi format buổi luyện đổi.
    const turnCount = await pool.query('SELECT COUNT(*)::int AS total FROM turns WHERE session_id = $1', [session.sessionId]);
    assert.equal(results.rows.length, turnCount.rows[0].total);
    assert.ok(
      results.rows.every((row) => row.status === 'failed'),
      'AI chưa cấu hình nên mọi lượt phải được ghi là failed, không treo ở processing'
    );
  } finally {
    await cleanup(session);
  }
});

// Reproduces what a session interrupted mid-grading looks like to the recovery
// sweep: claimed, with result rows still sitting at 'processing'.
async function makeSessionLookStuck(sessionId) {
  await pool.query("UPDATE sessions SET status = 'processing' WHERE id = $1", [sessionId]);
  await pool.query(
    `
      INSERT INTO ai_results (id, turn_id, status)
      SELECT gen_random_uuid(), id, 'processing' FROM turns WHERE session_id = $1
      ON CONFLICT (turn_id) DO UPDATE SET status = 'processing', error_message = NULL
    `,
    [sessionId]
  );
}

// The sweep re-runs anything stuck in 'processing' every five minutes. A session
// that fails for a permanent reason would be retried — and charged for — forever
// without this ceiling.
test('a session that keeps getting stuck is retried a limited number of times', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let session = null;

  try {
    session = await createMatchedSession(
      `ai-limit-${randomUUID().slice(0, 8)}`,
      { userId: await createUser('Limit A', 6.5), band: 6.5 },
      { userId: await createUser('Limit B', 6), band: 6 }
    );
    await markSessionActive(session.sessionId);
    await markEveryTurnUploaded(session.sessionId);

    // Each pass is a crash-and-resume cycle: the session looks stuck again, so the
    // sweep picks it up, exactly as a permanently failing session would behave.
    const outcomes = [];
    for (let pass = 0; pass < MAX_AI_ATTEMPTS + 1; pass += 1) {
      await makeSessionLookStuck(session.sessionId);
      outcomes.push(await runSessionAiPipeline(session.sessionId));
    }

    assert.equal(
      outcomes.filter((outcome) => outcome.ran).length,
      MAX_AI_ATTEMPTS,
      'số lần chấm thật phải đúng bằng giới hạn'
    );
    assert.equal(outcomes.at(-1).skipped, 'attempts-exhausted');

    // Giving up must still leave the session finished, not stuck on a spinner —
    // and out of 'processing', so the sweep stops finding it.
    assert.equal(await getSessionStatus(pool, session.sessionId), 'completed');

    const rows = await pool.query(
      `
        SELECT ar.status, ar.error_message
        FROM ai_results ar
        JOIN turns tr ON tr.id = ar.turn_id
        WHERE tr.session_id = $1
      `,
      [session.sessionId]
    );
    assert.ok(
      rows.rows.every((row) => row.status === 'failed'),
      'mọi lượt phải được ghi là failed thay vì treo ở processing'
    );
    assert.ok(
      rows.rows.some((row) => row.error_message?.includes('Chấm lại cả bài')),
      'người dùng phải được nói cho biết cách thử lại'
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
