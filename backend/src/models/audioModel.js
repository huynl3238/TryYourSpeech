import pool from '../config/db.js';
import { maybeStartSessionProcessing } from './processingModel.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function canUploadAudio(session) {
  return session.status === 'active' || session.status === 'reviewing';
}

function isUserInSession(session, userId) {
  return session.user_a_id === userId || session.user_b_id === userId;
}

async function getSession(client, sessionId) {
  const result = await client.query(
    `
      SELECT
        id,
        user_a_id,
        user_b_id,
        status,
        user_a_review_done_at,
        user_b_review_done_at
      FROM sessions
      WHERE id = $1
    `,
    [sessionId]
  );

  return result.rows[0] || null;
}

async function getTurn(client, sessionId, turnId) {
  const result = await client.query(
    `
      SELECT id, speaker_id, question_id
      FROM turns
      WHERE id = $1 AND session_id = $2
    `,
    [turnId, sessionId]
  );

  return result.rows[0] || null;
}

async function markSessionReviewing(client, sessionId) {
  await client.query(
    `
      UPDATE sessions
      SET status = 'reviewing'
      WHERE id = $1 AND status = 'active'
    `,
    [sessionId]
  );
}

function validateUploadInput({ sessionId, turnId, speakerId, questionId, durationMs }) {
  if (!isNonEmptyString(sessionId)) {
    throw new Error('sessionId is required');
  }

  if (!isNonEmptyString(turnId)) {
    throw new Error('turnId is required');
  }

  if (!isNonEmptyString(speakerId)) {
    throw new Error('speakerId is required');
  }

  if (!isNonEmptyString(questionId)) {
    throw new Error('questionId is required');
  }

  if (!isPositiveInteger(durationMs)) {
    throw new Error('durationMs must be a positive integer');
  }
}

async function validateAudioUploadPermission(client, { sessionId, turnId, speakerId, questionId, durationMs }) {
  validateUploadInput({ sessionId, turnId, speakerId, questionId, durationMs });

  const session = await getSession(client, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (!canUploadAudio(session)) {
    throw new Error('Session is not available for audio upload');
  }

  if (!isUserInSession(session, speakerId)) {
    throw new Error('Speaker is not in this session');
  }

  const turn = await getTurn(client, sessionId, turnId);
  if (!turn) {
    throw new Error('Turn does not belong to this session');
  }

  if (turn.speaker_id !== speakerId) {
    throw new Error('Speaker can only upload their own turn');
  }

  if (turn.question_id !== questionId) {
    throw new Error('questionId does not match this turn');
  }
}

export async function validateAudioUpload({ sessionId, turnId, speakerId, questionId, durationMs }) {
  const client = await pool.connect();

  try {
    await validateAudioUploadPermission(client, {
      sessionId,
      turnId,
      speakerId,
      questionId,
      durationMs,
    });
  } finally {
    client.release();
  }
}

// Who is allowed to listen to one recording. The answer is deliberately assembled
// in a single query so that the rule lives in one readable place: the two people
// who were in the session, plus everybody once the pair has agreed to publish it
// to the classroom. Admins are let through for the same support reasons that
// requireSelfParam already lets them through elsewhere.
//
// Everything here used to be moot: /uploads/audio was served by express.static
// with no check at all, so any recording was downloadable by anyone who had the
// URL, and hiding a classroom post left its audio just as reachable as before.
export async function getTurnAudioAccess(turnId, user) {
  if (!isNonEmptyString(turnId) || !user?.id) {
    return { allowed: false, audioUrl: null };
  }

  const result = await pool.query(
    `
      SELECT
        tr.audio_url,
        s.user_a_id,
        s.user_b_id,
        EXISTS (
          SELECT 1
          FROM classroom_posts cp
          WHERE cp.session_id = s.id AND cp.status = 'published'
        ) AS is_published
      FROM turns tr
      JOIN sessions s ON s.id = tr.session_id
      WHERE tr.id = $1
    `,
    [turnId]
  );

  const row = result.rows[0];
  if (!row || !isNonEmptyString(row.audio_url)) {
    return { allowed: false, audioUrl: null };
  }

  const allowed =
    row.user_a_id === user.id ||
    row.user_b_id === user.id ||
    row.is_published === true ||
    user.userRole === 'admin';

  // A refusal gives back no path at all. The caller already checks `allowed`, but
  // a location on disk is exactly the kind of thing that ends up in a log line or
  // an error body by accident, and there is no reason for a refusal to carry one.
  return { allowed, audioUrl: allowed ? row.audio_url : null };
}

export async function saveAudioUpload({
  sessionId,
  turnId,
  speakerId,
  questionId,
  durationMs,
  audioUrl,
}) {
  if (!isNonEmptyString(audioUrl)) {
    throw new Error('audioUrl is required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await validateAudioUploadPermission(client, {
      sessionId,
      turnId,
      speakerId,
      questionId,
      durationMs,
    });

    await markSessionReviewing(client, sessionId);
    await client.query(
      `
        UPDATE turns
        SET audio_url = $1, upload_status = 'uploaded'
        WHERE id = $2
      `,
      [audioUrl, turnId]
    );

    const aiStatus = await maybeStartSessionProcessing(client, sessionId);

    await client.query('COMMIT');

    return {
      turnId,
      audioUrl,
      status: 'uploaded',
      aiStatus,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
