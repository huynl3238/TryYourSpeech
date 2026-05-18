import { scoreSpeakingTurn } from '../services/ieltsRubricScoring.js';
import { assessAzurePronunciation } from '../services/azurePronunciationAssessment.js';
import {
  getAiConfigStatus,
  getMissingAiConfigNames,
} from '../config/ai.js';

const AI_WORKER_NOT_IMPLEMENTED_ERROR = 'AI worker is not implemented yet';

export { getAiConfigStatus };

function getMissingConfigError(missingConfigNames) {
  return `AI services are not configured. Missing: ${missingConfigNames.join(', ')}`;
}

async function markProcessingResultsFailed(client, sessionId, errorMessage) {
  await client.query(
    `
      UPDATE ai_results
      SET status = 'failed',
          error_message = $2,
          updated_at = NOW()
      WHERE status = 'processing'
        AND turn_id IN (
          SELECT id
          FROM turns
          WHERE session_id = $1
        )
    `,
    [sessionId, errorMessage]
  );
}

async function getProcessingTurns(client, sessionId) {
  const result = await client.query(
    `
      SELECT
        tr.id AS turn_id,
        tr.audio_url,
        tr.question_id,
        tr.part_number,
        tr.duration_ms,
        q.question_text,
        q.cue_card,
        COALESCE(
          json_agg(
            json_build_object(
              'timestampMs', pn.timestamp_ms,
              'errorType', pn.error_type,
              'noteText', pn.note_text
            )
            ORDER BY pn.timestamp_ms
          ) FILTER (WHERE pn.id IS NOT NULL),
          '[]'
        ) AS peer_notes
      FROM turns tr
      JOIN ai_results ar ON ar.turn_id = tr.id
      JOIN questions q ON q.id = tr.question_id
      LEFT JOIN peer_notes pn ON pn.turn_id = tr.id
      WHERE tr.session_id = $1
        AND ar.status = 'processing'
      GROUP BY
        tr.id,
        tr.turn_index,
        tr.audio_url,
        tr.question_id,
        tr.part_number,
        tr.duration_ms,
        q.question_text,
        q.cue_card
      ORDER BY tr.turn_index
    `,
    [sessionId]
  );

  return result.rows;
}

async function markTurnResultFailed(client, turnId, errorMessage) {
  await client.query(
    `
      UPDATE ai_results
      SET status = 'failed',
          error_message = $2,
          updated_at = NOW()
      WHERE turn_id = $1
        AND status = 'processing'
    `,
    [turnId, errorMessage]
  );
}

async function markTurnResultCompleted(client, turnId, result) {
  await client.query(
    `
      UPDATE ai_results
      SET status = 'completed',
          whisper_transcript = $2,
          fluency_score = $3,
          lexical_score = $4,
          grammar_score = $5,
          pronunciation_score = $6,
          pronunciation_detail = $7,
          ai_feedback = $8,
          error_message = NULL,
          updated_at = NOW()
      WHERE turn_id = $1
        AND status = 'processing'
    `,
    [
      turnId,
      result.transcript,
      result.scores.fluency,
      result.scores.lexical,
      result.scores.grammar,
      result.scores.pronunciation,
      JSON.stringify(result.pronunciationDetail),
      JSON.stringify(result.aiFeedback),
    ]
  );
}

function createPendingStep(name) {
  return async () => {
    throw new Error(`${name} step is not implemented yet`);
  };
}

const transcribeTurnAudio = createPendingStep('Transcription');
const generateSpeakingFeedback = createPendingStep('Speaking feedback');

async function assessPronunciation(turn, transcript) {
  return await assessAzurePronunciation({
    audioUrl: turn.audio_url,
    durationMs: turn.duration_ms,
    referenceText: transcript,
  });
}

function getFeedbackScoringMetrics(feedback) {
  return feedback?.scoringMetrics || feedback?.metrics || null;
}

function getRubricResult(turn, feedback) {
  const metrics = getFeedbackScoringMetrics(feedback);
  if (!metrics) {
    return null;
  }

  return scoreSpeakingTurn({
    partNumber: turn.part_number,
    metrics,
  });
}

function getScoresFromRubric(rubricResult) {
  if (!rubricResult?.ok) {
    return null;
  }

  return rubricResult.scores;
}

function buildAiFeedback(feedback, rubricResult) {
  if (!rubricResult) {
    return feedback || {};
  }

  return {
    ...(feedback || {}),
    rubric: rubricResult,
  };
}

async function runTurnPipeline(_client, turn) {
  const transcript = await transcribeTurnAudio(turn);
  const pronunciationResult = await assessPronunciation(turn, transcript);
  const feedback = await generateSpeakingFeedback(turn, transcript, pronunciationResult);
  const feedbackScores = feedback?.scores || {};
  const rubricResult = getRubricResult(turn, feedback);
  const rubricScores = getScoresFromRubric(rubricResult) || {};

  return {
    transcript,
    scores: {
      fluency: rubricScores.fluency
        ?? feedbackScores.fluency
        ?? pronunciationResult?.fluencyScore
        ?? null,
      lexical: rubricScores.lexical ?? feedbackScores.lexical ?? null,
      grammar: rubricScores.grammar ?? feedbackScores.grammar ?? null,
      pronunciation: rubricScores.pronunciation
        ?? feedbackScores.pronunciation
        ?? pronunciationResult?.pronunciationScore
        ?? null,
    },
    pronunciationDetail: pronunciationResult?.detail || [],
    aiFeedback: buildAiFeedback(feedback, rubricResult),
  };
}

async function failProcessingTurns(client, sessionId, errorMessage) {
  const turns = await getProcessingTurns(client, sessionId);

  for (const turn of turns) {
    await markTurnResultFailed(client, turn.turn_id, errorMessage);
  }

  return {
    started: false,
    status: 'failed',
    reason: errorMessage,
    processedTurns: turns.length,
  };
}

async function failSessionBecauseAiConfigMissing(client, sessionId, missingConfigNames) {
  const errorMessage = getMissingConfigError(missingConfigNames);
  const result = await failProcessingTurns(client, sessionId, errorMessage);

  console.warn(`${errorMessage}. Session ${sessionId} was completed with failed AI results.`);

  return result;
}

async function failSessionBecauseWorkerIsMissing(client, sessionId) {
  const turns = await getProcessingTurns(client, sessionId);

  for (const turn of turns) {
    try {
      const result = await runTurnPipeline(client, turn);
      await markTurnResultCompleted(client, turn.turn_id, result);
    } catch (err) {
      await markTurnResultFailed(client, turn.turn_id, err.message || AI_WORKER_NOT_IMPLEMENTED_ERROR);
    }
  }

  console.warn(`Session ${sessionId} was completed because the AI worker is not implemented yet.`);

  return {
    started: false,
    status: 'failed',
    reason: AI_WORKER_NOT_IMPLEMENTED_ERROR,
    processedTurns: turns.length,
  };
}

export async function prepareAiPipeline(client, sessionId) {
  const missingConfigNames = getMissingAiConfigNames();

  if (missingConfigNames.length > 0) {
    return failSessionBecauseAiConfigMissing(client, sessionId, missingConfigNames);
  }

  return failSessionBecauseWorkerIsMissing(client, sessionId);
}
