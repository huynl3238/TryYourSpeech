import pool from '../config/db.js';
import { scheduleSessionAiPipeline } from './processingModel.js';
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

function toBand(value) {
  return value === null || value === undefined ? null : Number(value);
}

// Reads the whole-test holistic result for one user. Fluency/Lexical/Grammar are
// graded once across all answers; pronunciation is the aggregated Azure band.
async function getHolisticResult(client, sessionId, userId) {
  const result = await client.query(
    `
      SELECT
        status,
        fluency_score,
        lexical_score,
        grammar_score,
        pronunciation_score,
        overall_band,
        holistic_feedback,
        error_message
      FROM session_ai_results
      WHERE session_id = $1 AND user_id = $2
    `,
    [sessionId, userId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    status: row.status,
    scores: {
      fluency: toBand(row.fluency_score),
      lexical: toBand(row.lexical_score),
      grammar: toBand(row.grammar_score),
      pronunciation: toBand(row.pronunciation_score),
    },
    overallBand: toBand(row.overall_band),
    feedback: row.holistic_feedback || {},
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
    const holistic = session.session_mode === 'mentor'
      ? null
      : await getHolisticResult(client, sessionId, userId);

    return {
      sessionId,
      status: session.status,
      sessionMode: session.session_mode || 'peer',
      turnResults,
      holistic,
      mentorReview,
    };
  } finally {
    client.release();
  }
}

// Holistic scoring grades the WHOLE test at once, so a retry is per-user, not per-turn:
// if any of the user's turns failed, or the whole-test grading failed, the entire pass
// is redone. Returns true when there is anything to retry.
async function userHasFailedResults(client, sessionId, userId) {
  const result = await client.query(
    `
      SELECT 1
      FROM turns tr
      JOIN ai_results ar ON ar.turn_id = tr.id
      WHERE tr.session_id = $1
        AND tr.speaker_id = $2
        AND ar.status = 'failed'
      UNION
      SELECT 1
      FROM session_ai_results sar
      WHERE sar.session_id = $1
        AND sar.user_id = $2
        AND sar.status = 'failed'
      LIMIT 1
    `,
    [sessionId, userId]
  );

  return result.rows.length > 0;
}

// Resets ALL of the user's turns (not just failed ones) back to 'processing'. The
// whole-test grader needs every answer available in a single pass, so completed turns
// are reprocessed too.
async function resetUserResultsForRetry(client, sessionId, userId) {
  await client.query(
    `
      UPDATE ai_results ar
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
      FROM turns tr
      WHERE ar.turn_id = tr.id
        AND tr.session_id = $1
        AND tr.speaker_id = $2
    `,
    [sessionId, userId]
  );

  await client.query(
    `
      UPDATE session_ai_results
      SET status = 'processing',
          fluency_score = NULL,
          lexical_score = NULL,
          grammar_score = NULL,
          pronunciation_score = NULL,
          overall_band = NULL,
          holistic_feedback = NULL,
          error_message = NULL,
          updated_at = NOW()
      WHERE session_id = $1
        AND user_id = $2
    `,
    [sessionId, userId]
  );
}

async function markSessionProcessingForRetry(client, sessionId) {
  await client.query(
    `
      UPDATE sessions
      SET status = 'processing',
          ended_at = NULL,
          -- A retry the user asked for buys a fresh set of automatic attempts;
          -- otherwise a session that had already exhausted them would be given up
          -- on immediately, before the pipeline ran even once.
          ai_attempts = 0
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

    const hasFailures = await userHasFailedResults(client, sessionId, userId);
    if (!hasFailures) {
      throw new Error('No failed AI results to retry');
    }

    await markSessionProcessingForRetry(client, sessionId);
    await resetUserResultsForRetry(client, sessionId, userId);

    const sessionStatus = await getSessionStatus(client, sessionId);

    await client.query('COMMIT');

    // Same reason as the first attempt: grading is minutes of external API calls
    // and must not run inside this transaction. The reset above is the claim, and
    // the client polls GET /results for the outcome.
    scheduleSessionAiPipeline(sessionId);

    return {
      sessionId,
      userId,
      aiStatus: sessionStatus,
      sessionStatus,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
