import { randomUUID } from 'crypto';
import pool from '../config/db.js';
import { createNotification } from './notificationModel.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('review comment is invalid');
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requireNonEmptyString(value, fieldName) {
  if (!isNonEmptyString(value)) {
    throw new Error(`${fieldName} is required`);
  }
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

function canSaveMentorReview(session) {
  return ['active', 'reviewing', 'completed'].includes(session.status);
}

function validateMentorReviewSession(session, { mentorId, studentId }) {
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.session_mode !== 'mentor') {
    throw new Error('Session is not a mentor session');
  }

  if (!canSaveMentorReview(session)) {
    throw new Error('Session is not available for mentor review');
  }

  if (session.user_a_id !== studentId) {
    throw new Error('Student is not in this mentor session');
  }

  if (session.user_b_id !== mentorId) {
    throw new Error('Mentor is not in this mentor session');
  }
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

async function markMentorSessionCompleted(client, sessionId) {
  await client.query(
    `
      UPDATE sessions
      SET user_b_review_done_at = COALESCE(user_b_review_done_at, NOW()),
          status = 'completed',
          ended_at = COALESCE(ended_at, NOW())
      WHERE id = $1
        AND session_mode = 'mentor'
        AND status IN ('active', 'reviewing', 'completed')
    `,
    [sessionId]
  );
}

function mapMentorReview(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    mentorId: row.mentor_id,
    studentId: row.student_id,
    overallComment: row.overall_comment,
    pronunciationComment: row.pronunciation_comment,
    grammarComment: row.grammar_comment,
    vocabularyComment: row.vocabulary_comment,
    fluencyComment: row.fluency_comment,
    suggestedNextSteps: row.suggested_next_steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveMentorReview({
  sessionId,
  mentorId,
  studentId,
  overallComment,
  pronunciationComment,
  grammarComment,
  vocabularyComment,
  fluencyComment,
  suggestedNextSteps,
}) {
  requireNonEmptyString(sessionId, 'sessionId');
  requireNonEmptyString(mentorId, 'mentorId');
  requireNonEmptyString(studentId, 'studentId');
  requireNonEmptyString(overallComment, 'overallComment');

  const normalizedReview = {
    overallComment: overallComment.trim(),
    pronunciationComment: normalizeOptionalText(pronunciationComment),
    grammarComment: normalizeOptionalText(grammarComment),
    vocabularyComment: normalizeOptionalText(vocabularyComment),
    fluencyComment: normalizeOptionalText(fluencyComment),
    suggestedNextSteps: normalizeOptionalText(suggestedNextSteps),
  };

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const session = await getSession(client, sessionId);
    validateMentorReviewSession(session, { mentorId, studentId });

    await markSessionReviewing(client, sessionId);

    const result = await client.query(
      `
        INSERT INTO mentor_reviews (
          id,
          session_id,
          mentor_id,
          student_id,
          overall_comment,
          pronunciation_comment,
          grammar_comment,
          vocabulary_comment,
          fluency_comment,
          suggested_next_steps
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (session_id)
        DO UPDATE SET
          overall_comment = EXCLUDED.overall_comment,
          pronunciation_comment = EXCLUDED.pronunciation_comment,
          grammar_comment = EXCLUDED.grammar_comment,
          vocabulary_comment = EXCLUDED.vocabulary_comment,
          fluency_comment = EXCLUDED.fluency_comment,
          suggested_next_steps = EXCLUDED.suggested_next_steps,
          updated_at = NOW()
        RETURNING *
      `,
      [
        randomUUID(),
        sessionId,
        mentorId,
        studentId,
        normalizedReview.overallComment,
        normalizedReview.pronunciationComment,
        normalizedReview.grammarComment,
        normalizedReview.vocabularyComment,
        normalizedReview.fluencyComment,
        normalizedReview.suggestedNextSteps,
      ]
    );

    await markMentorSessionCompleted(client, sessionId);
    await createNotification(client, {
      recipientId: studentId,
      actorId: mentorId,
      type: 'mentor_review_completed',
      title: 'Mentor da gui nhan xet',
      body: normalizedReview.overallComment,
      entityType: 'session',
      entityId: sessionId,
    });
    await client.query('COMMIT');

    return {
      sessionId,
      status: 'completed',
      mentorReview: mapMentorReview(result.rows[0]),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getMentorReviewForSession(client, sessionId) {
  const result = await client.query(
    `
      SELECT *
      FROM mentor_reviews
      WHERE session_id = $1
    `,
    [sessionId]
  );

  return mapMentorReview(result.rows[0] || null);
}
