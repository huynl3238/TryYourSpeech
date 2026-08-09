import { randomUUID } from 'crypto';
import { assessAzurePronunciation } from '../services/azurePronunciationAssessment.js';
import { generateHolisticFeedback } from '../services/ieltsHolisticFeedback.js';
import { transcribeAudioFile } from '../services/openaiClient.js';
import { recordAiUsage } from './aiUsageModel.js';
import { resolveUploadAudioPath } from '../services/uploadPaths.js';
import {
  getAiConfigStatus,
  getAiRuntimeConfig,
  getMissingAiConfigNames,
} from '../config/ai.js';

export { getAiConfigStatus };

const TURNS_INCOMPLETE_ERROR =
  'Một số lượt nói chưa xử lý được nên chưa thể chấm tổng thể cả bài.';

function getMissingConfigError(missingConfigNames) {
  return `AI services are not configured. Missing: ${missingConfigNames.join(', ')}`;
}

function getMonthlyLimitError(limit) {
  return `Đã đạt giới hạn chấm AI trong tháng (${limit} lượt). Tạm dừng để không vượt ngân sách.`;
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function mean(values) {
  const finite = values.filter(isFiniteNumber);
  if (finite.length === 0) {
    return null;
  }

  return finite.reduce((total, value) => total + value, 0) / finite.length;
}

// Band tổng = trung bình các tiêu chí rồi làm tròn 0.5, đúng công thức IELTS thật.
//
// CỐ Ý chỉ gồm ba tiêu chí ngôn ngữ, KHÔNG có phát âm. Đo trên 5 bài mẫu có band
// tham chiếu (09/08/2026): điểm phát âm quy từ Azure ra band cho cả 5 người đều
// là 7.0–7.5, trong khi band thật của họ trải từ 4.5 đến 9.0 — nó gần như một
// hằng số và không phân biệt được ai với ai. Cộng nó vào band tổng chỉ làm sai
// lệch: tỉ lệ chấm nằm trong 0.5 band là 40% khi có phát âm, 80% khi bỏ ra.
//
// Azure vẫn được dùng, nhưng cho đúng việc nó làm tốt: chi tiết phát âm từng từ.
// Những tiêu chí tạo nên band tổng. Tách ra thành hàm riêng để test khoá được
// đúng quyết định này — computeOverallBand chỉ lấy trung bình những gì được đưa
// vào, nên nếu thêm phát âm trở lại thì nó sẽ âm thầm bị cộng vào band tổng.
export function buildHolisticScores(feedback) {
  const source = feedback?.scores || {};

  return {
    fluency: source.fluency ?? null,
    lexical: source.lexical ?? null,
    grammar: source.grammar ?? null,
  };
}

function computeOverallBand(scores) {
  const bands = Object.values(scores).filter(isFiniteNumber);
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
        tr.speaker_id,
        tr.turn_index,
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
        tr.speaker_id,
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

function groupTurnsBySpeaker(turns) {
  const bySpeaker = new Map();

  for (const turn of turns) {
    const speakerId = turn.speaker_id;
    if (!bySpeaker.has(speakerId)) {
      bySpeaker.set(speakerId, []);
    }
    bySpeaker.get(speakerId).push(turn);
  }

  return bySpeaker;
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

// A turn's own stage stores only the transcript and word-level pronunciation detail.
// Fluency/Lexical/Grammar and the pronunciation band are no longer per-turn — they are
// graded once for the whole test and stored in session_ai_results.
async function markTurnTranscribed(client, turnId, transcript, pronunciation) {
  await client.query(
    `
      UPDATE ai_results
      SET status = 'completed',
          whisper_transcript = $2,
          fluency_score = NULL,
          lexical_score = NULL,
          grammar_score = NULL,
          pronunciation_score = NULL,
          pronunciation_detail = $3,
          ai_feedback = NULL,
          error_message = NULL,
          updated_at = NOW()
      WHERE turn_id = $1
        AND status = 'processing'
    `,
    [turnId, transcript, JSON.stringify(pronunciation?.detail || [])]
  );
}

async function upsertSessionResultCompleted(client, sessionId, userId, holistic) {
  await client.query(
    `
      INSERT INTO session_ai_results (
        id, session_id, user_id, status,
        fluency_score, lexical_score, grammar_score, pronunciation_score,
        overall_band, holistic_feedback, error_message, updated_at
      )
      VALUES ($1, $2, $3, 'completed', $4, $5, $6, $7, $8, $9, NULL, NOW())
      ON CONFLICT (session_id, user_id) DO UPDATE SET
        status = 'completed',
        fluency_score = EXCLUDED.fluency_score,
        lexical_score = EXCLUDED.lexical_score,
        grammar_score = EXCLUDED.grammar_score,
        pronunciation_score = EXCLUDED.pronunciation_score,
        overall_band = EXCLUDED.overall_band,
        holistic_feedback = EXCLUDED.holistic_feedback,
        error_message = NULL,
        updated_at = NOW()
    `,
    [
      randomUUID(),
      sessionId,
      userId,
      holistic.scores.fluency,
      holistic.scores.lexical,
      holistic.scores.grammar,
      // Cột này giữ lại nhưng luôn NULL: không còn band phát âm nào để lưu. Điểm
      // thô của Azure nằm trong holistic_feedback.pronunciation. Không nhét số
      // 0–100 vào một cột mang nghĩa "band" — hai đơn vị khác nhau.
      null,
      holistic.overallBand,
      JSON.stringify(holistic.feedback),
    ]
  );
}

async function upsertSessionResultFailed(client, sessionId, userId, errorMessage) {
  await client.query(
    `
      INSERT INTO session_ai_results (
        id, session_id, user_id, status, error_message, updated_at
      )
      VALUES ($1, $2, $3, 'failed', $4, NOW())
      ON CONFLICT (session_id, user_id) DO UPDATE SET
        status = 'failed',
        fluency_score = NULL,
        lexical_score = NULL,
        grammar_score = NULL,
        pronunciation_score = NULL,
        overall_band = NULL,
        holistic_feedback = NULL,
        error_message = EXCLUDED.error_message,
        updated_at = NOW()
    `,
    [randomUUID(), sessionId, userId, errorMessage]
  );
}

// Both audio calls are billed by recording length, so the turn's own duration is
// the billed quantity — no estimate involved. Usage is recorded only after the
// call returns: a request that errors out is not charged.
async function transcribeTurnAudio(turn, sessionId) {
  const filePath = resolveUploadAudioPath(turn.audio_url);
  const runtimeConfig = getAiRuntimeConfig();

  const transcript = await transcribeAudioFile({
    filePath,
    model: runtimeConfig.openAiTranscriptionModel,
    language: runtimeConfig.azureSpeechLanguage.split('-')[0],
  });

  await recordAiUsage({
    sessionId,
    turnId: turn.turn_id,
    provider: 'openai',
    operation: 'transcription',
    model: runtimeConfig.openAiTranscriptionModel,
    audioSeconds: turn.duration_ms / 1000,
  });

  return transcript;
}

// Azure runs unscripted (no reference text): the candidate's speech is spontaneous,
// so pronunciation is assessed against Azure's acoustic model, not a transcript.
async function assessPronunciation(turn, sessionId) {
  const pronunciation = await assessAzurePronunciation({
    audioUrl: turn.audio_url,
    durationMs: turn.duration_ms,
  });

  await recordAiUsage({
    sessionId,
    turnId: turn.turn_id,
    provider: 'azure',
    operation: 'pronunciation',
    model: getAiRuntimeConfig().azureSpeechLanguage,
    audioSeconds: turn.duration_ms / 1000,
  });

  return pronunciation;
}

// Combines the per-turn Azure scores into one acoustic profile for the whole test so
// the pronunciation band reflects the entire performance, not a single answer.
function aggregatePronunciation(pronunciations) {
  return {
    accuracyScore: mean(pronunciations.map((p) => p?.accuracyScore)),
    fluencyScore: mean(pronunciations.map((p) => p?.fluencyScore)),
    prosodyScore: mean(pronunciations.map((p) => p?.prosodyScore)),
    pronunciationScore: mean(pronunciations.map((p) => p?.pronunciationScore)),
  };
}

// Grades Fluency/Lexical/Grammar once across every answer, then folds in the
// aggregated pronunciation band. `processedTurns` is [{ turn, transcript, pronunciation }].
async function runHolisticScoring(processedTurns, sessionId) {
  const runtimeConfig = getAiRuntimeConfig();

  const parts = processedTurns.map(({ turn, transcript }) => ({
    partNumber: turn.part_number,
    question: turn.question_text,
    cueCard: turn.cue_card,
    transcript,
  }));

  const aggregatedPronunciation = aggregatePronunciation(
    processedTurns.map(({ pronunciation }) => pronunciation)
  );

  const feedback = await generateHolisticFeedback({
    parts,
    pronunciation: aggregatedPronunciation,
    model: runtimeConfig.openAiFeedbackModel,
    // Fires as soon as OpenAI answers, before the reply is parsed — a response
    // that turns out to be unusable was still paid for.
    onUsage: ({ model, inputTokens, outputTokens }) => {
      recordAiUsage({
        sessionId,
        provider: 'openai',
        operation: 'feedback',
        model,
        inputTokens,
        outputTokens,
      });
    },
  });

  const scores = buildHolisticScores(feedback);

  return {
    scores,
    overallBand: computeOverallBand(scores),
    feedback: {
      ...feedback,
      // Điểm thô của Azure, KHÔNG quy ra band. Trước đây có một bảng 9 ngưỡng tự
      // đặt để quy 0–100 sang band IELTS; đó là chỗ duy nhất trong toàn hệ thống
      // có con số do mình nghĩ ra, và đo được là nó không phân biệt được trình độ.
      // Bỏ bảng đó đi thì mọi con số đưa cho người dùng đều là số do nhà cung cấp
      // đo hoặc do chính rubric IELTS quy định.
      pronunciation: {
        accuracyScore: aggregatedPronunciation.accuracyScore,
        fluencyScore: aggregatedPronunciation.fluencyScore,
        prosodyScore: aggregatedPronunciation.prosodyScore,
        pronunciationScore: aggregatedPronunciation.pronunciationScore,
      },
    },
  };
}

// Processes one speaker's turns (transcribe + pronunciation), then grades the whole
// test holistically. Returns true only when both stages succeed.
async function runSpeakerPipeline(client, sessionId, speakerId, speakerTurns) {
  const processedTurns = [];
  let anyTurnFailed = false;

  for (const turn of speakerTurns) {
    try {
      const transcript = await transcribeTurnAudio(turn, sessionId);
      const pronunciation = await assessPronunciation(turn, sessionId);
      await markTurnTranscribed(client, turn.turn_id, transcript, pronunciation);
      processedTurns.push({ turn, transcript, pronunciation });
    } catch (err) {
      console.error(`AI pipeline failed for turn ${turn.turn_id}:`, err.message);
      await markTurnResultFailed(client, turn.turn_id, err.message || 'AI processing failed');
      anyTurnFailed = true;
    }
  }

  if (anyTurnFailed || processedTurns.length === 0) {
    await upsertSessionResultFailed(client, sessionId, speakerId, TURNS_INCOMPLETE_ERROR);
    return false;
  }

  try {
    const holistic = await runHolisticScoring(processedTurns, sessionId);
    await upsertSessionResultCompleted(client, sessionId, speakerId, holistic);
    return true;
  } catch (err) {
    console.error(`Holistic scoring failed for user ${speakerId}:`, err.message);
    await upsertSessionResultFailed(
      client,
      sessionId,
      speakerId,
      err.message || 'Holistic scoring failed'
    );
    return false;
  }
}

async function failProcessingTurns(client, sessionId, errorMessage) {
  const turns = await getProcessingTurns(client, sessionId);

  for (const turn of turns) {
    await markTurnResultFailed(client, turn.turn_id, errorMessage);
  }

  for (const speakerId of groupTurnsBySpeaker(turns).keys()) {
    await upsertSessionResultFailed(client, sessionId, speakerId, errorMessage);
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
  const bySpeaker = groupTurnsBySpeaker(turns);
  let completedSpeakers = 0;

  for (const [speakerId, speakerTurns] of bySpeaker) {
    const ok = await runSpeakerPipeline(client, sessionId, speakerId, speakerTurns);
    if (ok) {
      completedSpeakers += 1;
    }
  }

  const allFailed = bySpeaker.size > 0 && completedSpeakers === 0;

  return {
    started: true,
    // Only short-circuit the caller with 'failed' when nothing succeeded; otherwise
    // let the session-completion logic derive the final status.
    status: allFailed ? 'failed' : null,
    reason: null,
    processedTurns: turns.length,
    completedSpeakers,
    failedSpeakers: bySpeaker.size - completedSpeakers,
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
