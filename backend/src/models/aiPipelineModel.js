import { assessAzurePronunciation } from '../services/azurePronunciationAssessment.js';
import { azureToPronunciationBand } from '../services/pronunciationScoring.js';
import { generateSpeakingFeedback } from '../services/ieltsSpeakingFeedback.js';
import { transcribeAudioFile } from '../services/openaiClient.js';
import { resolveUploadAudioPath } from '../services/uploadPaths.js';
import {
  getAiConfigStatus,
  getAiRuntimeConfig,
  getMissingAiConfigNames,
} from '../config/ai.js';

export { getAiConfigStatus };

function getMissingConfigError(missingConfigNames) {
  return `AI services are not configured. Missing: ${missingConfigNames.join(', ')}`;
}

function getMonthlyLimitError(limit) {
  return `Đã đạt giới hạn chấm AI trong tháng (${limit} lượt). Tạm dừng để không vượt ngân sách.`;
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

function computeOverallBand(scores) {
  const bands = Object.values(scores).filter(
    (band) => typeof band === 'number' && Number.isFinite(band)
  );
  if (bands.length === 0) {
    return null;
  }

  const average = bands.reduce((total, band) => total + band, 0) / bands.length;
  return roundToHalf(average);
}

async function getMonthlyAssessmentCount(client) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS count
      FROM ai_results
      WHERE status = 'completed'
        AND updated_at >= date_trunc('month', NOW())
    `
  );

  return result.rows[0]?.count ?? 0;
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

async function transcribeTurnAudio(turn) {
  const filePath = resolveUploadAudioPath(turn.audio_url);
  const runtimeConfig = getAiRuntimeConfig();

  return await transcribeAudioFile({
    filePath,
    model: runtimeConfig.openAiTranscriptionModel,
    language: runtimeConfig.azureSpeechLanguage.split('-')[0],
  });
}

// Azure runs unscripted (no reference text): the candidate's speech is spontaneous,
// so pronunciation is assessed against Azure's acoustic model, not a transcript.
async function assessPronunciation(turn) {
  return await assessAzurePronunciation({
    audioUrl: turn.audio_url,
    durationMs: turn.duration_ms,
  });
}

async function generateTurnFeedback(turn, transcript, pronunciation) {
  const runtimeConfig = getAiRuntimeConfig();

  return await generateSpeakingFeedback({
    turn,
    transcript,
    pronunciation,
    model: runtimeConfig.openAiFeedbackModel,
  });
}

function buildAiFeedback(feedback, pronunciation, scores) {
  return {
    ...feedback,
    pronunciation: {
      band: scores.pronunciation,
      accuracyScore: pronunciation?.accuracyScore ?? null,
      fluencyScore: pronunciation?.fluencyScore ?? null,
      prosodyScore: pronunciation?.prosodyScore ?? null,
      pronunciationScore: pronunciation?.pronunciationScore ?? null,
    },
    overallBand: computeOverallBand(scores),
  };
}

async function runTurnPipeline(turn) {
  const transcript = await transcribeTurnAudio(turn);
  const pronunciation = await assessPronunciation(turn);
  const feedback = await generateTurnFeedback(turn, transcript, pronunciation);

  const scores = {
    fluency: feedback.scores.fluency ?? null,
    lexical: feedback.scores.lexical ?? null,
    grammar: feedback.scores.grammar ?? null,
    pronunciation: azureToPronunciationBand(pronunciation),
  };

  return {
    transcript,
    scores,
    pronunciationDetail: pronunciation?.detail || [],
    aiFeedback: buildAiFeedback(feedback, pronunciation, scores),
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

async function failSessionBecauseMonthlyLimitReached(client, sessionId, limit) {
  const errorMessage = getMonthlyLimitError(limit);
  const result = await failProcessingTurns(client, sessionId, errorMessage);

  console.warn(`${errorMessage} Session ${sessionId} was completed with failed AI results.`);

  return result;
}

async function runSessionPipeline(client, sessionId) {
  const turns = await getProcessingTurns(client, sessionId);
  let completedTurns = 0;

  for (const turn of turns) {
    try {
      const result = await runTurnPipeline(turn);
      await markTurnResultCompleted(client, turn.turn_id, result);
      completedTurns += 1;
    } catch (err) {
      console.error(`AI pipeline failed for turn ${turn.turn_id}:`, err.message);
      await markTurnResultFailed(client, turn.turn_id, err.message || 'AI processing failed');
    }
  }

  const allFailed = turns.length > 0 && completedTurns === 0;

  return {
    started: true,
    // Only short-circuit the caller with 'failed' when nothing succeeded; otherwise
    // let the session-completion logic derive the final status.
    status: allFailed ? 'failed' : null,
    reason: null,
    processedTurns: turns.length,
    completedTurns,
    failedTurns: turns.length - completedTurns,
  };
}

export async function prepareAiPipeline(client, sessionId) {
  const missingConfigNames = getMissingAiConfigNames();
  if (missingConfigNames.length > 0) {
    return failSessionBecauseAiConfigMissing(client, sessionId, missingConfigNames);
  }

  const { monthlyAssessmentLimit } = getAiRuntimeConfig();
  if (monthlyAssessmentLimit > 0) {
    const monthlyCount = await getMonthlyAssessmentCount(client);
    if (monthlyCount >= monthlyAssessmentLimit) {
      return failSessionBecauseMonthlyLimitReached(client, sessionId, monthlyAssessmentLimit);
    }
  }

  return runSessionPipeline(client, sessionId);
}
