import pool from '../config/db.js';
import { prepareAiPipeline } from './aiPipelineModel.js';
import { getMentorReviewForSession } from './mentorReviewModel.js';
import {
  getSessionStatus,
  markSessionCompletedIfAllResultsTerminal,
} from './sessionLifecycleModel.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function mapScores(row) {
  return {
    fluency: row.fluency_score === null ? null : Number(row.fluency_score),
    lexical: row.lexical_score === null ? null : Number(row.lexical_score),
    grammar: row.grammar_score === null ? null : Number(row.grammar_score),
    pronunciation: row.pronunciation_score === null ? null : Number(row.pronunciation_score),
  };
}

function mapPeerNote(row) {
  return {
    timestampMs: row.timestamp_ms,
    errorType: row.error_type,
    noteText: row.note_text,
  };
}

function mapTurnResult(row, sessionMode = 'peer') {
  return {
    turnId: row.turn_id,
    questionText: row.question_text,
    audioUrl: row.audio_url,
    aiStatus: sessionMode === 'mentor' ? 'not_required' : row.ai_status || 'pending',
    transcript: row.whisper_transcript,
    scores: mapScores(row),
    pronunciationDetail: row.pronunciation_detail || [],
    aiFeedback: sessionMode === 'mentor' ? {} : row.ai_feedback || {},
    peerNotes: row.peer_notes || [],
    error: row.error_message,
  };
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

function canRetryResults(session) {
  return session.status === 'processing' || session.status === 'completed';
}

async function getTurnResults(client, sessionId, userId, sessionMode) {
  const result = await client.query(
    `
      SELECT
        tr.id AS turn_id,
        tr.audio_url,
        q.question_text,
        ar.status AS ai_status,
        ar.whisper_transcript,
        ar.fluency_score,
        ar.lexical_score,
        ar.grammar_score,
        ar.pronunciation_score,
        ar.pronunciation_detail,
        ar.ai_feedback,
        ar.error_message,
        COALESCE(
          json_agg(
            json_build_object(
              'timestamp_ms', pn.timestamp_ms,
              'error_type', pn.error_type,
              'note_text', pn.note_text
            )
            ORDER BY pn.timestamp_ms
          ) FILTER (WHERE pn.id IS NOT NULL),
          '[]'
        ) AS peer_notes
      FROM turns tr
      JOIN questions q ON q.id = tr.question_id
      LEFT JOIN ai_results ar ON ar.turn_id = tr.id
      LEFT JOIN peer_notes pn ON pn.turn_id = tr.id
      WHERE tr.session_id = $1 AND tr.speaker_id = $2
      GROUP BY
        tr.id,
        tr.turn_index,
        tr.audio_url,
        q.question_text,
        ar.status,
        ar.whisper_transcript,
        ar.fluency_score,
        ar.lexical_score,
        ar.grammar_score,
        ar.pronunciation_score,
        ar.pronunciation_detail,
        ar.ai_feedback,
        ar.error_message
      ORDER BY tr.turn_index
    `,
    [sessionId, userId]
  );

  return result.rows.map((row) => ({
    ...mapTurnResult(row, sessionMode),
    peerNotes: row.peer_notes.map(mapPeerNote),
  }));
}

export async function getResultsForUser({ sessionId, userId }) {
  if (!isNonEmptyString(sessionId)) {
    throw new Error('sessionId is required');
  }

  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const client = await pool.connect();

  try {
    const session = await getSession(client, sessionId);
    if (!session) {
      return null;
    }

    if (!isUserInSession(session, userId)) {
      throw new Error('User is not in this session');
    }

    const turnResults = await getTurnResults(client, sessionId, userId, session.session_mode);
    const mentorReview = session.session_mode === 'mentor'
      ? await getMentorReviewForSession(client, sessionId)
      : null;

    return {
      sessionId,
      status: session.status,
      sessionMode: session.session_mode || 'peer',
      turnResults,
      mentorReview,
    };
  } finally {
    client.release();
  }
}

async function getRetryableTurnIds(client, { sessionId, userId, turnId }) {
  const params = [sessionId, userId];
  const turnFilter = turnId ? 'AND tr.id = $3' : '';

  if (turnId) {
    params.push(turnId);
  }

  const result = await client.query(
    `
      SELECT tr.id
      FROM turns tr
      JOIN ai_results ar ON ar.turn_id = tr.id
      WHERE tr.session_id = $1
        AND tr.speaker_id = $2
        AND ar.status = 'failed'
        ${turnFilter}
      ORDER BY tr.turn_index
    `,
    params
  );

  return result.rows.map((row) => row.id);
}

async function resetAiResultForRetry(client, turnId) {
  await client.query(
    `
      UPDATE ai_results
      SET status = 'processing',
          whisper_transcript = NULL,
          fluency_score = NULL,
          lexical_score = NULL,
          grammar_score = NULL,
          pronunciation_score = NULL,
          pronunciation_detail = NULL,
          ai_feedback = NULL,
          error_message = NULL,
          updated_at = NOW()
      WHERE turn_id = $1
        AND status = 'failed'
    `,
    [turnId]
  );
}

async function markSessionProcessingForRetry(client, sessionId) {
  await client.query(
    `
      UPDATE sessions
      SET status = 'processing',
          ended_at = NULL
      WHERE id = $1
        AND status IN ('processing', 'completed')
    `,
    [sessionId]
  );
}

export async function retryFailedResults({ sessionId, userId, turnId }) {
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

    if (!isUserInSession(session, userId)) {
      throw new Error('User is not in this session');
    }

    if (!canRetryResults(session)) {
      throw new Error('Session is not available for result retry');
    }

    const turnIds = await getRetryableTurnIds(client, { sessionId, userId, turnId });
    if (turnIds.length === 0) {
      throw new Error('No failed AI results to retry');
    }

    await markSessionProcessingForRetry(client, sessionId);

    for (const retryTurnId of turnIds) {
      await resetAiResultForRetry(client, retryTurnId);
    }

    const pipeline = await prepareAiPipeline(client, sessionId);
    const completedStatus = await markSessionCompletedIfAllResultsTerminal(client, sessionId);
    const sessionStatus = completedStatus || await getSessionStatus(client, sessionId);

    await client.query('COMMIT');

    return {
      sessionId,
      userId,
      retried: turnIds.length,
      aiStatus: pipeline.status || sessionStatus,
      sessionStatus,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
