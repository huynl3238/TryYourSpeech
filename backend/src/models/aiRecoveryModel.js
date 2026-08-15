import pool from '../config/db.js';
import { runSessionAiPipeline } from './processingModel.js';

// Grading happens in the background, so a deploy or crash can interrupt a run
// midway and leave a session sitting in 'processing' with nothing left to move
// it along. This sweep is what makes the hand-off durable: the claim written in
// the database is the queue, and anything still claimed after a restart gets
// picked back up.
//
// Sessions are only swept after a grace period. Without it, the sweep would race
// the run that is currently in flight for a freshly claimed session — harmless
// thanks to the advisory lock, but it would burn a connection every minute.
//
// A session that keeps failing is not swept forever: runSessionAiPipeline enforces
// MAX_AI_ATTEMPTS and, once those are used up, marks the session's remaining work
// failed so it leaves 'processing' and stops matching the query below.
const STALE_AFTER_MINUTES = 10;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let sweepTimer = null;

// Staleness is measured across both per-turn and holistic rows. The holistic row
// is created before paid work begins, so a crash after the last transcript but
// before whole-test scoring finishes remains visible to this sweep.
async function findStuckSessionIds() {
  const result = await pool.query(
    `
      SELECT
        s.id,
        GREATEST(turn_progress.last_progress, holistic_progress.last_progress) AS last_progress
      FROM sessions s
      LEFT JOIN LATERAL (
        SELECT
          MAX(ar.updated_at) AS last_progress,
          BOOL_OR(ar.status = 'processing') AS has_processing
        FROM turns tr
        JOIN ai_results ar ON ar.turn_id = tr.id
        WHERE tr.session_id = s.id
      ) turn_progress ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          MAX(sar.updated_at) AS last_progress,
          BOOL_OR(sar.status = 'processing') AS has_processing
        FROM session_ai_results sar
        WHERE sar.session_id = s.id
      ) holistic_progress ON TRUE
      WHERE s.status = 'processing'
        AND s.session_mode = 'peer'
        AND (
          COALESCE(turn_progress.has_processing, FALSE)
          OR COALESCE(holistic_progress.has_processing, FALSE)
          OR EXISTS (
            SELECT 1
            FROM turns missing_turn
            WHERE missing_turn.session_id = s.id
              AND missing_turn.upload_status = 'uploaded'
              AND NOT EXISTS (
                SELECT 1
                FROM session_ai_results missing_result
                WHERE missing_result.session_id = missing_turn.session_id
                  AND missing_result.user_id = missing_turn.speaker_id
              )
          )
        )
        AND GREATEST(
          COALESCE(turn_progress.last_progress, TIMESTAMP '-infinity'),
          COALESCE(holistic_progress.last_progress, TIMESTAMP '-infinity')
        ) < NOW() - ($1 || ' minutes')::interval
      ORDER BY last_progress
      LIMIT 20
    `,
    [String(STALE_AFTER_MINUTES)]
  );

  return result.rows.map((row) => row.id);
}

export async function sweepStuckAiSessions() {
  let sessionIds;

  try {
    sessionIds = await findStuckSessionIds();
  } catch (err) {
    console.warn('Could not look for stuck AI sessions:', err.message);
    return { swept: 0 };
  }

  if (sessionIds.length === 0) {
    return { swept: 0 };
  }

  console.log(`Resuming AI grading for ${sessionIds.length} interrupted session(s)`);

  let swept = 0;
  for (const sessionId of sessionIds) {
    try {
      // Sequential on purpose: these call paid, rate-limited APIs, and a burst
      // after a restart is exactly when we least want to hammer them.
      const result = await runSessionAiPipeline(sessionId);
      if (result.ran) {
        swept += 1;
      }
    } catch (err) {
      console.error(`Failed to resume AI grading for session ${sessionId}:`, err.message);
    }
  }

  return { swept };
}

export function startAiRecoverySweep() {
  if (sweepTimer) {
    return;
  }

  // The first pass is delayed so it cannot slow down boot, and so a rolling
  // restart does not have every instance sweeping at the same instant.
  setTimeout(() => {
    sweepStuckAiSessions().catch((err) => {
      console.error('AI recovery sweep failed:', err.message);
    });
  }, 30 * 1000);

  sweepTimer = setInterval(() => {
    sweepStuckAiSessions().catch((err) => {
      console.error('AI recovery sweep failed:', err.message);
    });
  }, SWEEP_INTERVAL_MS);

  // Without this the interval keeps the event loop alive and the process never
  // exits cleanly on SIGTERM.
  sweepTimer.unref();
}

export function stopAiRecoverySweep() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
