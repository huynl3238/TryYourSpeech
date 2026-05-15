import pool from '../config/db.js';

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

async function hasAllAudioUploaded(client, sessionId) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS pending_count
      FROM turns
      WHERE session_id = $1 AND upload_status <> 'uploaded'
    `,
    [sessionId]
  );

  return result.rows[0].pending_count === 0;
}

async function getReviewState(client, sessionId) {
  const result = await client.query(
    `
      SELECT user_a_review_done_at, user_b_review_done_at
      FROM sessions
      WHERE id = $1
    `,
    [sessionId]
  );

  return result.rows[0];
}

async function maybeStartProcessing(client, sessionId) {
  const reviewState = await getReviewState(client, sessionId);
  const bothCompleted =
    reviewState.user_a_review_done_at !== null &&
    reviewState.user_b_review_done_at !== null;

  if (!bothCompleted || !(await hasAllAudioUploaded(client, sessionId))) {
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

  return 'processing';
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

    const aiStatus = await maybeStartProcessing(client, sessionId);

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
