import { randomUUID } from 'node:crypto';
import pool from '../config/db.js';

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toInteger(value) {
  return Math.round(toNumber(value));
}

function toMinutes(seconds) {
  return Math.round((toNumber(seconds) / 60) * 10) / 10;
}

// Deliberately writes on the pool, NOT on the caller's transaction client.
//
// The AI pipeline runs inside a transaction that rolls back when grading fails.
// Rolling back the *results* is right; rolling back the *usage record* is not —
// OpenAI and Azure already ran that call and will bill for it. Recording outside
// the transaction is what makes a failed run still show up in the totals.
//
// Never throws: bookkeeping must not be able to break grading.
export async function recordAiUsage({
  sessionId = null,
  turnId = null,
  provider,
  operation,
  model = null,
  audioSeconds = 0,
  inputTokens = 0,
  outputTokens = 0,
}) {
  try {
    await pool.query(
      `
        INSERT INTO ai_usage (
          id, session_id, turn_id, provider, operation, model,
          audio_seconds, input_tokens, output_tokens
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        randomUUID(),
        sessionId,
        turnId,
        provider,
        operation,
        model,
        toNumber(audioSeconds).toFixed(2),
        toInteger(inputTokens),
        toInteger(outputTokens),
      ]
    );
  } catch (err) {
    console.error('Không ghi được nhật ký sử dụng AI:', err.message);
  }
}

// How much of the paid APIs the app consumed, in the units the providers
// actually bill by: seconds of audio and tokens. No money anywhere — the
// providers do not report a price per call, so any figure in dollars here would
// be an estimate dressed up as a measurement.
export async function getAiUsageSummary() {
  const [totals, byOperation, sessionScope, wasted, daily] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at::date = NOW()::date)::int AS calls_today,
        COALESCE(SUM(audio_seconds) FILTER (
          WHERE created_at::date = NOW()::date AND operation = 'transcription'
        ), 0) AS audio_seconds_today,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS calls_month,
        COALESCE(SUM(audio_seconds) FILTER (
          WHERE created_at >= date_trunc('month', NOW()) AND operation = 'transcription'
        ), 0) AS audio_seconds_month,
        COALESCE(SUM(input_tokens) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0)
          AS input_tokens_month,
        COALESCE(SUM(output_tokens) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0)
          AS output_tokens_month
      FROM ai_usage
    `),
    pool.query(`
      SELECT operation,
             COUNT(*)::int AS calls,
             COALESCE(SUM(audio_seconds), 0) AS audio_seconds,
             COALESCE(SUM(input_tokens), 0) AS input_tokens,
             COALESCE(SUM(output_tokens), 0) AS output_tokens
        FROM ai_usage
       WHERE created_at >= date_trunc('month', NOW())
       GROUP BY operation
       ORDER BY operation
    `),
    // Consumption per graded session is what forecasts the next invoice: it is
    // what one more learner finishing one more practice adds.
    pool.query(`
      SELECT COUNT(DISTINCT session_id)::int AS sessions_month
        FROM ai_usage
       WHERE created_at >= date_trunc('month', NOW())
         AND session_id IS NOT NULL
    `),
    // Audio and tokens already spent on sessions that failed anyway — paid work
    // that bought the user nothing, and the first thing worth fixing.
    pool.query(`
      SELECT COUNT(DISTINCT au.session_id)::int AS sessions,
             COALESCE(SUM(au.audio_seconds), 0) AS audio_seconds,
             COALESCE(SUM(au.input_tokens + au.output_tokens), 0) AS tokens
        FROM ai_usage au
       WHERE au.created_at >= date_trunc('month', NOW())
         AND EXISTS (
           SELECT 1 FROM session_ai_results sar
            WHERE sar.session_id = au.session_id
              AND sar.status = 'failed'
         )
    `),
    pool.query(`
      SELECT created_at::date AS day,
             COUNT(*)::int AS calls,
             COALESCE(SUM(audio_seconds), 0) AS audio_seconds
        FROM ai_usage
       WHERE created_at >= NOW() - INTERVAL '14 days'
       GROUP BY day
       ORDER BY day
    `),
  ]);

  const row = totals.rows[0];
  const sessionsMonth = toInteger(sessionScope.rows[0].sessions_month);
  const audioMinutesMonth = toMinutes(row.audio_seconds_month);
  const tokensMonth = toInteger(row.input_tokens_month) + toInteger(row.output_tokens_month);

  return {
    callsToday: toInteger(row.calls_today),
    audioMinutesToday: toMinutes(row.audio_seconds_today),
    callsMonth: toInteger(row.calls_month),
    audioMinutesMonth,
    inputTokensMonth: toInteger(row.input_tokens_month),
    outputTokensMonth: toInteger(row.output_tokens_month),
    sessionsMonth,
    audioMinutesPerSession: sessionsMonth > 0
      ? Math.round((audioMinutesMonth / sessionsMonth) * 10) / 10
      : 0,
    tokensPerSession: sessionsMonth > 0 ? Math.round(tokensMonth / sessionsMonth) : 0,
    wasted: {
      sessions: toInteger(wasted.rows[0].sessions),
      audioMinutes: toMinutes(wasted.rows[0].audio_seconds),
      tokens: toInteger(wasted.rows[0].tokens),
    },
    byOperation: byOperation.rows.map((operationRow) => ({
      operation: operationRow.operation,
      calls: toInteger(operationRow.calls),
      audioMinutes: toMinutes(operationRow.audio_seconds),
      tokens: toInteger(operationRow.input_tokens) + toInteger(operationRow.output_tokens),
    })),
    daily: daily.rows.map((dailyRow) => ({
      day: dailyRow.day instanceof Date ? dailyRow.day.toISOString() : dailyRow.day,
      calls: toInteger(dailyRow.calls),
      audioMinutes: toMinutes(dailyRow.audio_seconds),
    })),
  };
}
