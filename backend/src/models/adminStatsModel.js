import pool from '../config/db.js';

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
    sessionsByStatus,
    sessionsPerDay,
    userBands,
    aiByStatus,
    aiBands,
    audioVolume,
    failedAi,
    content,
    classroomByStatus,
    pendingPosts,
    systemHealth,
  ] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') AS new_users_7d,
        (SELECT COUNT(*) FROM users WHERE user_role = 'mentor') AS mentor_count,
        (SELECT COUNT(*) FROM users WHERE user_role = 'admin') AS admin_count,
        (SELECT COUNT(*) FROM sessions) AS total_sessions,
        (SELECT COUNT(*) FROM sessions WHERE status = 'completed') AS completed_sessions,
        (SELECT COUNT(*) FROM sessions WHERE status = 'abandoned') AS abandoned_sessions,
        (SELECT COUNT(*) FROM sessions WHERE created_at::date = NOW()::date) AS sessions_today,
        (SELECT COUNT(*) FROM sessions WHERE session_mode = 'mentor') AS mentor_sessions,
        (SELECT COUNT(*) FROM sessions WHERE session_mode = 'peer') AS peer_sessions,
        (SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))
           FROM sessions
          WHERE ended_at IS NOT NULL AND started_at IS NOT NULL) AS avg_session_seconds
    `),
    pool.query('SELECT status, COUNT(*)::int AS count FROM sessions GROUP BY status'),
    pool.query(`
      SELECT created_at::date AS day, COUNT(*)::int AS count
        FROM sessions
       WHERE created_at >= NOW() - INTERVAL '14 days'
       GROUP BY day
       ORDER BY day
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
    pool.query(`
      SELECT
        COALESCE(SUM(duration_ms), 0)::bigint AS total_ms,
        COUNT(*)::int AS uploaded_turns
        FROM turns
       WHERE upload_status = 'uploaded'
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
        (SELECT COUNT(*) FROM topics) AS total_topics,
        (SELECT COUNT(*) FROM topics WHERE scope = 'system') AS system_topics,
        (SELECT COUNT(*) FROM topics WHERE scope = 'mentor_private') AS mentor_topics,
        (SELECT COUNT(*) FROM questions) AS total_questions
    `),
    pool.query('SELECT status, COUNT(*)::int AS count FROM classroom_posts GROUP BY status'),
    pool.query(`
      SELECT cp.id, cp.title, cp.created_at, u.display_name AS author
        FROM classroom_posts cp
        JOIN users u ON u.id = cp.author_id
       WHERE cp.status = 'pending'
       ORDER BY cp.created_at DESC
       LIMIT 20
    `),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM turns WHERE upload_status = 'failed') AS failed_uploads,
        (SELECT COUNT(*) FROM turns WHERE upload_status = 'pending') AS pending_uploads,
        (SELECT COUNT(*) FROM mentor_sessions WHERE status = 'open') AS open_mentor_sessions,
        (SELECT COUNT(*) FROM ai_results WHERE status = 'failed') AS failed_turn_results
    `),
  ]);

  const o = overview.rows[0];
  const totalSessions = toInteger(o.total_sessions);
  const completedSessions = toInteger(o.completed_sessions);
  const totalMinutes = Math.round(toInteger(audioVolume.rows[0].total_ms) / 60000);

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      totalUsers: toInteger(o.total_users),
      newUsers7d: toInteger(o.new_users_7d),
      mentorCount: toInteger(o.mentor_count),
      adminCount: toInteger(o.admin_count),
      totalSessions,
      completedSessions,
      abandonedSessions: toInteger(o.abandoned_sessions),
      sessionsToday: toInteger(o.sessions_today),
      mentorSessions: toInteger(o.mentor_sessions),
      peerSessions: toInteger(o.peer_sessions),
      completionRate: totalSessions > 0
        ? Math.round((completedSessions / totalSessions) * 100)
        : 0,
      avgSessionSeconds: toNumberOrNull(o.avg_session_seconds),
    },
    sessionsByStatus: sessionsByStatus.rows.map((row) => ({
      status: row.status,
      count: toInteger(row.count),
    })),
    sessionsPerDay: sessionsPerDay.rows.map((row) => ({
      day: toIsoString(row.day),
      count: toInteger(row.count),
    })),
    userBands: userBands.rows.map((row) => ({
      band: toNumberOrNull(row.band),
      count: toInteger(row.count),
    })),
    ai: {
      byStatus: aiByStatus.rows.map((row) => ({
        status: row.status,
        count: toInteger(row.count),
      })),
      bandDistribution: aiBands.rows.map((row) => ({
        band: toNumberOrNull(row.overall_band),
        count: toInteger(row.count),
      })),
      uploadedTurns: toInteger(audioVolume.rows[0].uploaded_turns),
      totalAudioMinutes: totalMinutes,
      failedTurnResults: toInteger(systemHealth.rows[0].failed_turn_results),
      failures: failedAi.rows.map((row) => ({
        sessionId: row.session_id,
        userId: row.user_id,
        displayName: row.display_name,
        errorMessage: row.error_message,
        updatedAt: toIsoString(row.updated_at),
      })),
    },
    content: {
      totalTopics: toInteger(content.rows[0].total_topics),
      systemTopics: toInteger(content.rows[0].system_topics),
      mentorTopics: toInteger(content.rows[0].mentor_topics),
      totalQuestions: toInteger(content.rows[0].total_questions),
      classroomByStatus: classroomByStatus.rows.map((row) => ({
        status: row.status,
        count: toInteger(row.count),
      })),
      pendingPosts: pendingPosts.rows.map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        createdAt: toIsoString(row.created_at),
      })),
    },
    system: {
      failedUploads: toInteger(systemHealth.rows[0].failed_uploads),
      pendingUploads: toInteger(systemHealth.rows[0].pending_uploads),
      openMentorSessions: toInteger(systemHealth.rows[0].open_mentor_sessions),
    },
  };
}
