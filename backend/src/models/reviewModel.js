import { randomUUID } from 'crypto';
import pool from '../config/db.js';
import { maybeStartSessionProcessing } from './processingModel.js';

const ERROR_TYPES = new Set([
  'grammar_error',
  'collocation_issue',
  'pause_filler',
  'false_start',
  'pronunciation_issue',
  'advanced_vocab',
  'good_connector',
  'idea_development',
  'pronunciation',
  'grammar',
  'vocabulary',
  'fluency',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidTimestamp(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateNoteShape(note) {
  if (!isNonEmptyString(note.clientNoteId)) {
    return 'clientNoteId is required';
  }

  if (!isNonEmptyString(note.turnId)) {
    return 'turnId is required';
  }

  if (!isValidTimestamp(note.timestampMs)) {
    return 'timestampMs must be a non-negative integer';
  }

  if (!ERROR_TYPES.has(note.errorType)) {
    return 'errorType is invalid';
  }

  return null;
}

async function getSession(client, sessionId) {
  const result = await client.query(
    `
      SELECT id, user_a_id, user_b_id, session_mode, status
      FROM sessions
      WHERE id = $1
    `,
    [sessionId]
  );

  return result.rows[0] || null;
}

function isUserInSession(session, userId) {
  return session.user_a_id === userId || session.user_b_id === userId;
}

function canReviewSession(session) {
  return session.status === 'active' || session.status === 'reviewing';
}

function canCompleteReview(session) {
  return session.status === 'active' || session.status === 'reviewing' || session.status === 'completed';
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

async function getTurn(client, sessionId, turnId) {
  const result = await client.query(
    `
      SELECT id, speaker_id
      FROM turns
      WHERE id = $1 AND session_id = $2
    `,
    [turnId, sessionId]
  );

  return result.rows[0] || null;
}

async function insertPeerNote(client, listenerId, note) {
  const result = await client.query(
    `
      INSERT INTO peer_notes (
        id,
        turn_id,
        listener_id,
        client_note_id,
        timestamp_ms,
        error_type,
        note_text
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (listener_id, turn_id, client_note_id) DO NOTHING
      RETURNING id
    `,
    [
      randomUUID(),
      note.turnId,
      listenerId,
      note.clientNoteId,
      note.timestampMs,
      note.errorType,
      note.noteText || null,
    ]
  );

  return result.rowCount;
}

export async function savePeerNotesBatch({ sessionId, listenerId, notes }) {
  if (!isNonEmptyString(sessionId)) {
    throw new Error('sessionId is required');
  }

  if (!isNonEmptyString(listenerId)) {
    throw new Error('listenerId is required');
  }

  if (!Array.isArray(notes)) {
    throw new Error('notes must be an array');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const session = await getSession(client, sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (!canReviewSession(session)) {
      throw new Error('Session is not available for review');
    }

    if (!isUserInSession(session, listenerId)) {
      throw new Error('Listener is not in this session');
    }

    let saved = 0;

    for (const note of notes) {
      const shapeError = validateNoteShape(note);
      if (shapeError) {
        throw new Error(shapeError);
      }

      const turn = await getTurn(client, sessionId, note.turnId);
      if (!turn) {
        throw new Error('Turn does not belong to this session');
      }

      if (turn.speaker_id === listenerId) {
        throw new Error('Listener cannot note their own turn');
      }

      saved += await insertPeerNote(client, listenerId, note);
    }

    await markSessionReviewing(client, sessionId);
    await client.query('COMMIT');

    return { saved };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function getReviewColumnForUser(session, userId) {
  if (session.user_a_id === userId) {
    return 'user_a_review_done_at';
  }

  if (session.user_b_id === userId) {
    return 'user_b_review_done_at';
  }

  return null;
}

export async function completeReview({ sessionId, userId }) {
  if (!isNonEmptyString(sessionId)) {
    throw new Error('sessionId is required');
  }

  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const session = await getSession(client, sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (!canCompleteReview(session)) {
      throw new Error('Session is not available for review');
    }

    const reviewColumn = getReviewColumnForUser(session, userId);
    if (!reviewColumn) {
      throw new Error('User is not in this session');
    }

    await markSessionReviewing(client, sessionId);
    await client.query(
      `
        UPDATE sessions
        SET ${reviewColumn} = COALESCE(${reviewColumn}, NOW())
        WHERE id = $1
      `,
      [sessionId]
    );

    // This user has finished reviewing, so any of their own turns whose audio
    // never uploaded won't arrive anymore. Mark them 'failed' so the processing
    // gate (which waits on still-pending uploads) isn't blocked forever by a
    // lost recording — the pipeline then runs on whatever audio did upload.
    await client.query(
      `
        UPDATE turns
        SET upload_status = 'failed'
        WHERE session_id = $1 AND speaker_id = $2 AND upload_status = 'pending'
      `,
      [sessionId, userId]
    );

    const updatedSession = await getSessionWithReviewState(client, sessionId);
    const bothCompleted =
      updatedSession.user_a_review_done_at !== null &&
      updatedSession.user_b_review_done_at !== null;

    let sessionStatus = updatedSession.status;
    if (updatedSession.status === 'completed') {
      sessionStatus = 'completed';
    } else if (session.session_mode === 'mentor') {
      sessionStatus = await completeMentorSessionIfMentorReviewed(client, sessionId) || sessionStatus;
    } else {
      sessionStatus = await maybeStartSessionProcessing(client, sessionId);
    }

    await client.query('COMMIT');

    return {
      sessionId,
      userId,
      bothCompleted,
      sessionStatus,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getSessionWithReviewState(client, sessionId) {
  const result = await client.query(
    `
      SELECT user_a_review_done_at, user_b_review_done_at, status
      FROM sessions
      WHERE id = $1
    `,
    [sessionId]
  );

  return result.rows[0];
}

async function completeMentorSessionIfMentorReviewed(client, sessionId) {
  const result = await client.query(
    `
      UPDATE sessions s
      SET status = 'completed',
          ended_at = COALESCE(ended_at, NOW())
      WHERE s.id = $1
        AND s.session_mode = 'mentor'
        AND s.user_b_review_done_at IS NOT NULL
        AND s.status = 'reviewing'
        AND EXISTS (
          SELECT 1
          FROM mentor_reviews mr
          WHERE mr.session_id = s.id
        )
      RETURNING status
    `,
    [sessionId]
  );

  return result.rows[0]?.status || null;
}
