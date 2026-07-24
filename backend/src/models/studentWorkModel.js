import pool from '../config/db.js';

function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function getReviewStatus(row) {
  if (row.classroom_post_id) {
    return 'published';
  }

  if (row.status === 'completed') {
    return row.session_mode === 'mentor' && !row.mentor_review_id
      ? 'needs_mentor_review'
      : 'ready_to_publish';
  }

  if (row.status === 'processing') {
    return 'processing';
  }

  if (row.status === 'reviewing') {
    return 'waiting_review';
  }

  return 'in_progress';
}

function mapStudent(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    band: toNumberOrNull(row.band),
    userRole: row.user_role || 'student',
  };
}

function mapStudentWorkRow(row) {
  const participants = row.participants || [];
  const primaryStudent = participants.find((participant) => participant.userRole === 'student')
    || participants[0]
    || null;

  return {
    id: row.id,
    sessionMode: row.session_mode || 'peer',
    status: row.status,
    reviewStatus: getReviewStatus(row),
    publicStatus: row.classroom_post_id ? 'published' : 'private',
    classroomPostId: row.classroom_post_id,
    topic: {
      id: row.topic_id,
      name: row.topic_name,
    },
    participants,
    primaryStudent,
    createdAt: toIsoString(row.created_at),
    startedAt: toIsoString(row.started_at),
    endedAt: toIsoString(row.ended_at),
    turnCount: toInteger(row.turn_count),
    notesCount: toInteger(row.notes_count),
    aiCompletedCount: toInteger(row.ai_completed_count),
    aiFailedCount: toInteger(row.ai_failed_count),
    overallBand: toNumberOrNull(row.overall_band),
    mentorReviewSummary: row.mentor_review_summary,
  };
}

export async function listStudentWork({ limit = 50 } = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 100
    ? limit
    : 50;
  const client = await pool.connect();

  try {
    const result = await client.query(
      `
        SELECT
          s.id,
          s.session_mode,
          s.status,
          s.created_at,
          s.started_at,
          s.ended_at,
          t.id AS topic_id,
          t.name AS topic_name,
          COALESCE(turn_summary.turn_count, 0) AS turn_count,
          COALESCE(note_summary.notes_count, 0) AS notes_count,
          COALESCE(ai_summary.completed_count, 0) AS ai_completed_count,
          COALESCE(ai_summary.failed_count, 0) AS ai_failed_count,
          holistic_summary.overall_band,
          mr.id AS mentor_review_id,
          mr.overall_comment AS mentor_review_summary,
          cp.id AS classroom_post_id,
          json_build_array(
            json_build_object(
              'id', ua.id,
              'displayName', ua.display_name,
              'band', ua.band,
              'userRole', ua.user_role,
              'role', 'A'
            ),
            json_build_object(
              'id', ub.id,
              'displayName', ub.display_name,
              'band', ub.band,
              'userRole', ub.user_role,
              'role', 'B'
            )
          ) AS participants
        FROM sessions s
        JOIN topics t ON t.id = s.topic_id
        JOIN users ua ON ua.id = s.user_a_id
        JOIN users ub ON ub.id = s.user_b_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS turn_count
          FROM turns tr
          WHERE tr.session_id = s.id
        ) turn_summary ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS notes_count
          FROM peer_notes pn
          JOIN turns tr ON tr.id = pn.turn_id
          WHERE tr.session_id = s.id
        ) note_summary ON true
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE ar.status = 'completed')::int AS completed_count,
            COUNT(*) FILTER (WHERE ar.status = 'failed')::int AS failed_count
          FROM turns tr
          LEFT JOIN ai_results ar ON ar.turn_id = tr.id
          WHERE tr.session_id = s.id
        ) ai_summary ON true
        LEFT JOIN LATERAL (
          SELECT ROUND(AVG(overall_band) * 2) / 2 AS overall_band
          FROM session_ai_results
          WHERE session_id = s.id
            AND overall_band IS NOT NULL
        ) holistic_summary ON true
        LEFT JOIN mentor_reviews mr ON mr.session_id = s.id
        LEFT JOIN classroom_posts cp ON cp.session_id = s.id
          AND cp.status = 'published'
        ORDER BY COALESCE(s.ended_at, s.started_at, s.created_at) DESC
        LIMIT $1
      `,
      [safeLimit]
    );

    return {
      sessions: result.rows.map(mapStudentWorkRow),
    };
  } finally {
    client.release();
  }
}
