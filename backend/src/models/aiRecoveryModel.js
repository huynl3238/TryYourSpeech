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
const STALE_AFTER_MINUTES = 10;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let sweepTimer = null;

// Staleness is measured on the ai_results rows rather than the session, because
// sessions has no updated_at — and the result rows are the better signal anyway:
// they are touched as each turn finishes, so a long run that is still making
// progress does not look stuck.
async function findStuckSessionIds() {
  const result = await pool.query(
    `
      SELECT tr.session_id AS id, MAX(ar.updated_at) AS last_progress
      FROM ai_results ar
      JOIN turns tr ON tr.id = ar.turn_id
      JOIN sessions s ON s.id = tr.session_id
      WHERE ar.status = 'processing'
        AND s.status = 'processing'
        AND s.session_mode = 'peer'
      GROUP BY tr.session_id
      HAVING MAX(ar.updated_at) < NOW() - ($1 || ' minutes')::interval
      ORDER BY MAX(ar.updated_at)
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
