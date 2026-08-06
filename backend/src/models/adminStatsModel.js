import pool from '../config/db.js';
import { getAiRuntimeConfig } from '../config/ai.js';
import { getAiUsageSummary } from './aiUsageModel.js';

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

// One aggregate payload for the whole admin dashboard. Each query is independent
// so they run in parallel; everything comes straight from the DB except the
// realtime "live" block, which the route fills in from the socket layer.
export async function getAdminStats() {
  const [
    overview,
    userBands,
    aiByStatus,
    aiBands,
    monthlyQuota,
    failedAi,
    content,
    systemHealth,
    usage,
  ] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE user_role = 'mentor') AS mentor_count,
        (SELECT COUNT(*) FROM sessions WHERE created_at::date = NOW()::date) AS sessions_today,
        (SELECT COUNT(*) FROM sessions WHERE status = 'completed') AS completed_sessions,
        (SELECT COUNT(*) FROM sessions WHERE status = 'abandoned') AS abandoned_sessions,
        -- The denominator of the completion rate: only sessions that have already
        -- landed one way or the other. Counting every row instead would put every
        -- session still being practised or graded right now into the failure side
        -- of the ratio, which drags the number down for no reason other than
        -- someone being mid-test when the dashboard was opened.
        (SELECT COUNT(*) FROM sessions
          WHERE status IN ('completed', 'abandoned')) AS finished_sessions,
        -- Abandoned sessions are excluded on purpose. Someone who quit after
        -- thirty seconds did not have a thirty-second practice session; averaging
        -- them in describes nothing anyone would want to know.
        (SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))
           FROM sessions
          WHERE status = 'completed'
            AND ended_at IS NOT NULL
            AND started_at IS NOT NULL) AS avg_session_seconds
    `),
    pool.query(`
      SELECT band, COUNT(*)::int AS count
        FROM users
       WHERE band IS NOT NULL
       GROUP BY band
       ORDER BY band
    `),
    pool.query('SELECT status, COUNT(*)::int AS count FROM session_ai_results GROUP BY status'),
    pool.query(`
      SELECT overall_band, COUNT(*)::int AS count
        FROM session_ai_results
       WHERE overall_band IS NOT NULL
       GROUP BY overall_band
       ORDER BY overall_band
    `),
    // The same count the pipeline itself checks against AI_MONTHLY_ASSESSMENT_LIMIT
    // before it agrees to grade anything, so the dashboard shows the real
    // remaining headroom rather than a second, differently-computed number.
    pool.query(`
      SELECT COUNT(*)::int AS count
        FROM ai_results
       WHERE status = 'completed'
         AND updated_at >= date_trunc('month', NOW())
    `),
    pool.query(`
      SELECT sar.session_id, sar.user_id, sar.error_message, sar.updated_at,
             u.display_name
        FROM session_ai_results sar
        JOIN users u ON u.id = sar.user_id
       WHERE sar.status = 'failed'
       ORDER BY sar.updated_at DESC
       LIMIT 20
    `),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM topics WHERE scope = 'system') AS system_question_sets,
        (SELECT COUNT(*) FROM topics WHERE scope = 'mentor_private') AS mentor_question_sets,
        (SELECT COUNT(*) FROM classroom_posts WHERE status = 'pending') AS pending_posts
    `),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM turns WHERE upload_status = 'failed') AS failed_uploads,
        (SELECT COUNT(*) FROM turns WHERE upload_status = 'pending') AS pending_uploads,
        (SELECT COUNT(*) FROM ai_results WHERE status = 'failed') AS failed_turn_results,
        -- Sessions the recovery sweep would pick up: grading claimed but never
        -- finished. A number above zero here means users are staring at a
        -- spinner right now.
        (SELECT COUNT(*) FROM sessions
          WHERE status = 'processing'
            AND created_at < NOW() - INTERVAL '10 minutes') AS stuck_processing
    `),
    getAiUsageSummary(),
  ]);

  const o = overview.rows[0];
  const completedSessions = toInteger(o.completed_sessions);
  const finishedSessions = toInteger(o.finished_sessions);
  const monthlyLimit = getAiRuntimeConfig().monthlyAssessmentLimit;

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      totalUsers: toInteger(o.total_users),
      mentorCount: toInteger(o.mentor_count),
      sessionsToday: toInteger(o.sessions_today),
      completedSessions,
      abandonedSessions: toInteger(o.abandoned_sessions),
      completionRate: finishedSessions > 0
        ? Math.round((completedSessions / finishedSessions) * 100)
        : 0,
      avgSessionSeconds: toNumberOrNull(o.avg_session_seconds),
    },
    userBands: userBands.rows.map((row) => ({
      band: toNumberOrNull(row.band),
      count: toInteger(row.count),
    })),
    ai: {
      usage,
      quota: {
        used: toInteger(monthlyQuota.rows[0].count),
        // 0 or below disables the cap; the UI reads null as "không giới hạn".
        limit: monthlyLimit > 0 ? monthlyLimit : null,
      },
      byStatus: aiByStatus.rows.map((row) => ({
        status: row.status,
        count: toInteger(row.count),
      })),
      bandDistribution: aiBands.rows.map((row) => ({
        band: toNumberOrNull(row.overall_band),
        count: toInteger(row.count),
      })),
      failures: failedAi.rows.map((row) => ({
        sessionId: row.session_id,
        userId: row.user_id,
        displayName: row.display_name,
        errorMessage: row.error_message,
        updatedAt: toIsoString(row.updated_at),
      })),
    },
    content: {
      systemQuestionSets: toInteger(content.rows[0].system_question_sets),
      mentorQuestionSets: toInteger(content.rows[0].mentor_question_sets),
      pendingPosts: toInteger(content.rows[0].pending_posts),
    },
    system: {
      failedUploads: toInteger(systemHealth.rows[0].failed_uploads),
      pendingUploads: toInteger(systemHealth.rows[0].pending_uploads),
      failedTurnResults: toInteger(systemHealth.rows[0].failed_turn_results),
      stuckProcessing: toInteger(systemHealth.rows[0].stuck_processing),
    },
  };
}
