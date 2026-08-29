import pool from '../config/db.js';
import { parseBandOrThrow } from '../utils/band.js';

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

function mapUser(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    band: toNumberOrNull(row.band),
    userRole: row.user_role || 'student',
    createdAt: toIsoString(row.created_at),
  };
}

function mapStats(row) {
  return {
    totalSessions: toInteger(row.total_sessions),
    completedSessions: toInteger(row.completed_sessions),
    peerSessions: toInteger(row.peer_sessions),
    mentorSessions: toInteger(row.mentor_sessions),
    notesGivenCount: toInteger(row.notes_given_count),
    notesReceivedCount: toInteger(row.notes_received_count),
    latestEstimatedBand: toNumberOrNull(row.latest_estimated_band),
    averageEstimatedBand: toNumberOrNull(row.average_estimated_band),
    publishedPostsCount: toInteger(row.published_posts_count),
    likesReceivedCount: toInteger(row.likes_received_count),
    mentorSessionsCreated: toInteger(row.mentor_sessions_created),
    mentorReviewsCount: toInteger(row.mentor_reviews_count),
    lastPracticedAt: toIsoString(row.last_practiced_at),
  };
}

async function getUser(client, userId) {
  const result = await client.query(
    `
      SELECT id, display_name, band, user_role, created_at
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function getProfileStats(client, userId) {
  const result = await client.query(
    `
      WITH user_sessions AS (
        SELECT *
        FROM sessions
        WHERE user_a_id = $1 OR user_b_id = $1
      ),
      session_bands AS (
        SELECT
          us.id AS session_id,
          COALESCE(us.started_at, us.created_at) AS session_date,
          sar.overall_band AS estimated_band
        FROM user_sessions us
        JOIN session_ai_results sar ON sar.session_id = us.id AND sar.user_id = $1
        WHERE sar.status = 'completed'
          AND sar.overall_band IS NOT NULL
      ),
      latest_band AS (
        SELECT estimated_band
        FROM session_bands
        ORDER BY session_date DESC
        LIMIT 1
      )
      SELECT
        COUNT(us.id)::int AS total_sessions,
        COUNT(us.id) FILTER (WHERE us.status = 'completed')::int AS completed_sessions,
        COUNT(us.id) FILTER (WHERE us.session_mode = 'peer')::int AS peer_sessions,
        COUNT(us.id) FILTER (WHERE us.session_mode = 'mentor')::int AS mentor_sessions,
        (
          SELECT COUNT(*)::int
          FROM peer_notes pn
          JOIN turns tr ON tr.id = pn.turn_id
          WHERE pn.listener_id = $1
            AND tr.session_id IN (SELECT id FROM user_sessions)
        ) AS notes_given_count,
        (
          SELECT COUNT(*)::int
          FROM peer_notes pn
          JOIN turns tr ON tr.id = pn.turn_id
          WHERE tr.speaker_id = $1
            AND tr.session_id IN (SELECT id FROM user_sessions)
        ) AS notes_received_count,
        (SELECT estimated_band FROM latest_band) AS latest_estimated_band,
        (SELECT ROUND(AVG(estimated_band) * 2) / 2 FROM session_bands) AS average_estimated_band,
        (
          SELECT COUNT(*)::int
          FROM classroom_posts cp
          WHERE cp.author_id = $1 AND cp.status = 'published'
        ) AS published_posts_count,
        (
          SELECT COUNT(*)::int
          FROM classroom_post_likes l
          JOIN classroom_posts cp ON cp.id = l.post_id
          WHERE cp.author_id = $1
        ) AS likes_received_count,
        (
          SELECT COUNT(*)::int
          FROM mentor_sessions ms
          WHERE ms.mentor_id = $1
        ) AS mentor_sessions_created,
        (
          SELECT COUNT(*)::int
          FROM mentor_reviews mr
          WHERE mr.mentor_id = $1
        ) AS mentor_reviews_count,
        MAX(COALESCE(us.started_at, us.created_at)) AS last_practiced_at
      FROM user_sessions us
    `,
    [userId]
  );

  return result.rows[0] || {};
}

export async function getUserProfile(userId) {
  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const client = await pool.connect();

  try {
    const user = await getUser(client, userId);
    if (!user) {
      return null;
    }

    const stats = await getProfileStats(client, userId);

    return {
      user: mapUser(user),
      stats: mapStats(stats),
    };
  } finally {
    client.release();
  }
}

export async function updateUserProfile({ userId, displayName, band }) {
  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  if (!isNonEmptyString(displayName) || displayName.trim().length > 100) {
    throw new Error('displayName is invalid');
  }

  // Band is required here because matchmaking depends on it.
  const parsedBand = parseBandOrThrow(band, { required: true });

  const client = await pool.connect();

  try {
    const result = await client.query(
      `
        UPDATE users
        SET display_name = $2,
            band = $3
        WHERE id = $1
        RETURNING id, display_name, band, user_role, created_at
      `,
      [userId, displayName.trim(), parsedBand]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const stats = await getProfileStats(client, userId);

    return {
      user: mapUser(result.rows[0]),
      stats: mapStats(stats),
    };
  } finally {
    client.release();
  }
}
