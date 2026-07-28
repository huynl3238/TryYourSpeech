import { randomUUID } from 'crypto';
import pool from '../config/db.js';
import { prepareAiPipeline } from './aiPipelineModel.js';
import {
  getSessionStatus,
  markSessionCompletedIfAllResultsTerminal,
} from './sessionLifecycleModel.js';

// How many times grading may be started for one session before we stop trying.
// The first attempt is the hand-off from the request that finished the review, so
// this allows the initial run plus two rescues by the recovery sweep. A user can
// still ask for more explicitly: POST /results/retry resets the counter.
export const MAX_AI_ATTEMPTS = 3;

const ATTEMPTS_EXHAUSTED_MESSAGE =
  'Chấm điểm AI đã thử lại nhiều lần nhưng không thành công. Bạn có thể bấm "Chấm lại cả bài" để thử thêm.';

// Reserves one attempt, atomically. Returns the attempt number, or null when the
// ceiling has already been reached. Doing it as a single conditional UPDATE means
// two runners racing for the same session cannot both get the last attempt, and
// the counter never grows past the limit.
async function claimAiAttempt(client, sessionId) {
  const result = await client.query(
    `
      UPDATE sessions
      SET ai_attempts = ai_attempts + 1
      WHERE id = $1 AND ai_attempts < $2
      RETURNING ai_attempts
    `,
    [sessionId, MAX_AI_ATTEMPTS]
  );

  return result.rows[0]?.ai_attempts ?? null;
}

// Stops a session that has used up its attempts: everything still unfinished is
// recorded as failed so the session can leave 'processing'. That both frees the
// user from a spinner that would never resolve and takes the session out of the
// sweep's reach. The rows stay retryable by hand from the results screen.
async function giveUpOnAiGrading(client, sessionId) {
  await client.query(
    `
      UPDATE ai_results ar
      SET status = 'failed',
          error_message = $2,
          updated_at = NOW()
      FROM turns tr
      WHERE ar.turn_id = tr.id
        AND tr.session_id = $1
        AND ar.status = 'processing'
    `,
    [sessionId, ATTEMPTS_EXHAUSTED_MESSAGE]
  );

  await client.query(
    `
      UPDATE session_ai_results
      SET status = 'failed',
          error_message = $2,
          updated_at = NOW()
      WHERE session_id = $1
        AND status = 'processing'
    `,
    [sessionId, ATTEMPTS_EXHAUSTED_MESSAGE]
  );

  return await markSessionCompletedIfAllResultsTerminal(client, sessionId);
}

async function hasBothReviewsCompleted(client, sessionId) {
  const result = await client.query(
    `
      SELECT user_a_review_done_at, user_b_review_done_at
      FROM sessions
      WHERE id = $1
    `,
    [sessionId]
  );

  const session = result.rows[0];
  if (!session) {
    return false;
  }

  return session.user_a_review_done_at !== null && session.user_b_review_done_at !== null;
}

async function getSessionMode(client, sessionId) {
  const result = await client.query(
    `
      SELECT session_mode
      FROM sessions
      WHERE id = $1
    `,
    [sessionId]
  );

  return result.rows[0]?.session_mode || 'peer';
}

// True once no turn is still waiting on an in-flight upload. Turns marked
// 'failed' (upload gave up / review completed without the audio) do NOT block
// processing — otherwise one lost recording would stall the whole session
// forever. The pipeline simply runs on the turns that were 'uploaded'.
async function hasAllAudioUploaded(client, sessionId) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS pending_count
      FROM turns
      WHERE session_id = $1 AND upload_status = 'pending'
    `,
    [sessionId]
  );

  return result.rows[0].pending_count === 0;
}

async function getUploadedTurnIds(client, sessionId) {
  const result = await client.query(
    `
      SELECT id
      FROM turns
      WHERE session_id = $1 AND upload_status = 'uploaded'
      ORDER BY turn_index
    `,
    [sessionId]
  );

  return result.rows.map((row) => row.id);
}

async function createMissingAiResults(client, sessionId) {
  const turnIds = await getUploadedTurnIds(client, sessionId);

  for (const turnId of turnIds) {
    await client.query(
      `
        INSERT INTO ai_results (id, turn_id, status)
        VALUES ($1, $2, 'processing')
        ON CONFLICT (turn_id) DO NOTHING
      `,
      [randomUUID(), turnId]
    );
  }
}

// Decides whether the session is ready for AI and, if so, claims it — but does
// NOT grade anything. Grading is minutes of OpenAI and Azure calls; running it
// here would hold the caller's HTTP request and its database transaction open
// for that whole time, which meant one slow session could exhaust the connection
// pool and stall the entire app, and a client timeout mid-way rolled back scores
// that had already been paid for.
//
// The claim is durable: sessions.status = 'processing' plus an ai_results row per
// uploaded turn. That state is what runSessionAiPipeline() and the recovery sweep
// both read, so nothing is lost if the process dies between the two.
export async function maybeStartSessionProcessing(client, sessionId) {
  const sessionMode = await getSessionMode(client, sessionId);
  if (sessionMode === 'mentor') {
    return 'not_required';
  }

  if (!(await hasBothReviewsCompleted(client, sessionId))) {
    return 'pending';
  }

  if (!(await hasAllAudioUploaded(client, sessionId))) {
    return 'pending';
  }

  await client.query(
    `
      UPDATE sessions
      SET status = 'processing'
      WHERE id = $1 AND status = 'reviewing'
    `,
    [sessionId]
  );

  await createMissingAiResults(client, sessionId);

  // A session with no usable audio has nothing to grade, so it can finish right
  // here instead of waiting on a background run that would do nothing.
  const completedStatus = await markSessionCompletedIfAllResultsTerminal(client, sessionId);
  if (completedStatus) {
    return completedStatus;
  }

  // Handing off after the caller's transaction commits, so the worker sees the
  // claim we just wrote. The frontend already polls GET /results and knows how
  // to render 'processing', so returning early needs no client change.
  scheduleSessionAiPipeline(sessionId);

  return await getSessionStatus(client, sessionId);
}

// The grading itself, once a session is known to be claimed. Split out from the
// connection and locking below so it can be exercised directly.
export async function runAiForClaimedSession(client, sessionId) {
  const status = await getSessionStatus(client, sessionId);
  if (status !== 'processing') {
    return { skipped: `status-${status}` };
  }

  const attempt = await claimAiAttempt(client, sessionId);
  if (attempt === null) {
    console.warn(
      `Giving up on AI grading for session ${sessionId} after ${MAX_AI_ATTEMPTS} attempts`
    );
    const sessionStatus = await giveUpOnAiGrading(client, sessionId);

    return { skipped: 'attempts-exhausted', attempts: MAX_AI_ATTEMPTS, sessionStatus };
  }

  const pipeline = await prepareAiPipeline(client, sessionId);
  await markSessionCompletedIfAllResultsTerminal(client, sessionId);

  return { ran: true, ...pipeline };
}

// Runs the pipeline for one session on its own connection, outside any caller's
// transaction. Safe to call for a session that is already done or already being
// worked on: the advisory lock and the status checks both no-op in that case.
export async function runSessionAiPipeline(sessionId) {
  const client = await pool.connect();

  try {
    // Two callers can easily race here (both reviews finishing at once, or a
    // recovery sweep overlapping a fresh hand-off). This lock is held for the
    // session's lifetime on this connection and is released automatically if the
    // process dies, so a crash cannot leave a session locked forever.
    const lock = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [
      `session-ai:${sessionId}`,
    ]);

    if (!lock.rows[0].acquired) {
      return { skipped: 'already-running' };
    }

    try {
      return await runAiForClaimedSession(client, sessionId);
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`session-ai:${sessionId}`]);
    }
  } finally {
    client.release();
  }
}

// Deliberately not awaited by the request path. Failures are logged and leave
// the session in 'processing', which the recovery sweep picks up later — the
// request must not fail because grading did.
export function scheduleSessionAiPipeline(sessionId) {
  setImmediate(() => {
    runSessionAiPipeline(sessionId).catch((err) => {
      console.error(`Background AI pipeline failed for session ${sessionId}:`, err.message);
    });
  });
}
