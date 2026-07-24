import pool from '../config/db.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

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

function getPeerResultStatus(row) {
  if (row.status === 'processing') {
    return 'processing';
  }

  if (row.ai_failed_count > 0) {
    return 'ai_failed';
  }

  if (row.ai_completed_count > 0) {
    return 'ai_completed';
  }

  if (row.status === 'reviewing') {
    return 'reviewing';
  }

  if (row.status === 'active' || row.status === 'matched') {
    return 'in_progress';
  }

  return row.status;
}

function getMentorResultStatus(row) {
  if (row.mentor_review_id) {
    return 'mentor_reviewed';
  }

  if (row.status === 'completed') {
    return 'completed';
  }

  if (row.status === 'reviewing') {
    return 'waiting_mentor_review';
  }

  if (row.status === 'active' || row.status === 'matched') {
    return 'in_progress';
  }

  return row.status;
}

function getResultStatus(row) {
  return row.session_mode === 'mentor'
    ? getMentorResultStatus(row)
    : getPeerResultStatus(row);
}

function mapHistoryRow(row) {
  return {
    id: row.id,
    sessionMode: row.session_mode || 'peer',
    status: row.status,
    resultStatus: getResultStatus(row),
    topic: {
      id: row.topic_id,
      name: row.topic_name,
    },
    partner: {
      id: row.partner_id,
      displayName: row.partner_display_name,
      band: toNumberOrNull(row.partner_band),
      userRole: row.partner_user_role || 'student',
    },
    startedAt: toIsoString(row.started_at),
    endedAt: toIsoString(row.ended_at),
    createdAt: toIsoString(row.created_at),
    plannedDurationMs: toInteger(row.planned_duration_ms),
    turnCount: toInteger(row.turn_count),
    speakingTurnCount: toInteger(row.speaking_turn_count),
    notesGivenCount: toInteger(row.notes_given_count),
    notesReceivedCount: toInteger(row.notes_received_count),
    aiCompletedCount: toInteger(row.ai_completed_count),
    aiFailedCount: toInteger(row.ai_failed_count),
    aiPendingCount: toInteger(row.ai_pending_count),
    overallBand: toNumberOrNull(row.overall_band),
    publicStatus:
      row.classroom_post_status === 'published'
        ? 'published'
        : row.classroom_post_status === 'pending'
          ? 'pending'
          : 'private',
  };
}

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayName: row.display_name,
    band: toNumberOrNull(row.band),
    userRole: row.user_role || 'student',
  };
}

async function getUser(client, userId) {
  const result = await client.query(
    `
      SELECT id, display_name, band, user_role
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function getHistoryRows(client, userId, limit) {
  const result = await client.query(
    `
      SELECT
        s.id,
        s.session_mode,
        s.status,
        s.started_at,
        s.ended_at,
        s.created_at,
        t.id AS topic_id,
        t.name AS topic_name,
        partner.id AS partner_id,
        partner.display_name AS partner_display_name,
        partner.band AS partner_band,
        partner.user_role AS partner_user_role,
        COALESCE(turn_summary.turn_count, 0) AS turn_count,
        COALESCE(turn_summary.speaking_turn_count, 0) AS speaking_turn_count,
        COALESCE(turn_summary.planned_duration_ms, 0) AS planned_duration_ms,
        COALESCE(notes_given.notes_count, 0) AS notes_given_count,
        COALESCE(notes_received.notes_count, 0) AS notes_received_count,
        COALESCE(ai_summary.completed_count, 0) AS ai_completed_count,
        COALESCE(ai_summary.failed_count, 0) AS ai_failed_count,
        COALESCE(ai_summary.pending_count, 0) AS ai_pending_count,
        holistic_summary.overall_band,
        mr.id AS mentor_review_id,
        cp.id AS classroom_post_id,
        cp.status AS classroom_post_status
      FROM sessions s
      JOIN topics t ON t.id = s.topic_id
      JOIN users partner ON partner.id = CASE
        WHEN s.user_a_id = $1 THEN s.user_b_id
        ELSE s.user_a_id
      END
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS turn_count,
          COUNT(*) FILTER (WHERE speaker_id = $1)::int AS speaking_turn_count,
          COALESCE(SUM(duration_ms + prep_duration_ms), 0)::int AS planned_duration_ms
        FROM turns
        WHERE session_id = s.id
      ) turn_summary ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS notes_count
        FROM peer_notes
        WHERE listener_id = $1
          AND turn_id IN (
            SELECT id
            FROM turns
            WHERE session_id = s.id
          )
      ) notes_given ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS notes_count
        FROM peer_notes
        WHERE turn_id IN (
          SELECT id
          FROM turns
          WHERE session_id = s.id
            AND speaker_id = $1
        )
      ) notes_received ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE ar.status = 'completed')::int AS completed_count,
          COUNT(*) FILTER (WHERE ar.status = 'failed')::int AS failed_count,
          COUNT(*) FILTER (WHERE ar.status IS NULL OR ar.status = 'processing')::int AS pending_count
        FROM turns tr
        LEFT JOIN ai_results ar ON ar.turn_id = tr.id
        WHERE tr.session_id = s.id
          AND tr.speaker_id = $1
      ) ai_summary ON true
      LEFT JOIN LATERAL (
        SELECT overall_band
        FROM session_ai_results
        WHERE session_id = s.id
          AND user_id = $1
      ) holistic_summary ON true
      LEFT JOIN mentor_reviews mr ON mr.session_id = s.id
      LEFT JOIN classroom_posts cp ON cp.session_id = s.id
        AND cp.status <> 'declined'
      WHERE s.user_a_id = $1 OR s.user_b_id = $1
      ORDER BY COALESCE(s.started_at, s.created_at) DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}

export async function getPracticeHistoryForUser({ userId, limit = 50 }) {
  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 100
    ? limit
    : 50;

  const client = await pool.connect();

  try {
    const user = await getUser(client, userId);
    if (!user) {
      return null;
    }

    const rows = await getHistoryRows(client, userId, safeLimit);

    return {
      user: mapUser(user),
      sessions: rows.map(mapHistoryRow),
    };
  } finally {
    client.release();
  }
}
