import { randomUUID } from 'node:crypto';
import pool from '../config/db.js';
import { calculateUsageCostUsd, getAiPricing } from '../config/aiPricing.js';

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toInteger(value) {
  return Math.round(toNumber(value));
}

// Deliberately writes on the pool, NOT on the caller's transaction client.
//
// The AI pipeline runs inside a transaction that rolls back when grading fails.
// Rolling back the *results* is right; rolling back the *spend record* is not —
// OpenAI and Azure already charged for that call. Recording outside the
// transaction is what makes a failed run still show up in the cost total.
//
// Never throws: an accounting write must not be able to break grading.
export async function recordAiUsage({
  sessionId = null,
  turnId = null,
  provider,
  operation,
  model = null,
  audioSeconds = 0,
  inputTokens = 0,
  outputTokens = 0,
  succeeded = true,
}) {
  try {
    const costUsd = calculateUsageCostUsd({ operation, audioSeconds, inputTokens, outputTokens });

    await pool.query(
      `
        INSERT INTO ai_usage (
          id, session_id, turn_id, provider, operation, model,
          audio_seconds, input_tokens, output_tokens, cost_usd, succeeded
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        costUsd.toFixed(6),
        succeeded,
      ]
    );
  } catch (err) {
    console.error('Không ghi được nhật ký chi phí AI:', err.message);
  }
}

// Everything the admin dashboard needs to answer "tiền đang đi đâu".
export async function getAiCostSummary() {
  const [totals, byOperation, sessionScope, wasted, daily] = await Promise.all([
    pool.query(`
      SELECT
        COALESCE(SUM(cost_usd) FILTER (WHERE created_at::date = NOW()::date), 0) AS cost_today,
        COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0) AS cost_month,
        COALESCE(SUM(cost_usd), 0) AS cost_total,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS calls_month,
        COALESCE(SUM(audio_seconds) FILTER (
          WHERE created_at >= date_trunc('month', NOW()) AND operation = 'transcription'
        ), 0) AS audio_seconds_month
      FROM ai_usage
    `),
    pool.query(`
      SELECT operation,
             COALESCE(SUM(cost_usd), 0) AS cost,
             COUNT(*)::int AS calls
        FROM ai_usage
       WHERE created_at >= date_trunc('month', NOW())
       GROUP BY operation
    `),
    // Cost per graded session is the number that actually forecasts the bill:
    // it is what one more user finishing one more practice costs.
    pool.query(`
      SELECT COUNT(DISTINCT session_id)::int AS sessions_month
        FROM ai_usage
       WHERE created_at >= date_trunc('month', NOW())
         AND session_id IS NOT NULL
    `),
    // Money already spent on sessions that ended up failing anyway. A single
    // number for "how much did the broken runs cost me this month" — the thing
    // worth fixing first, because it buys the user nothing.
    pool.query(`
      SELECT COALESCE(SUM(au.cost_usd), 0) AS wasted_cost,
             COUNT(DISTINCT au.session_id)::int AS wasted_sessions
        FROM ai_usage au
       WHERE au.created_at >= date_trunc('month', NOW())
         AND EXISTS (
           SELECT 1 FROM session_ai_results sar
            WHERE sar.session_id = au.session_id
              AND sar.status = 'failed'
         )
    `),
    pool.query(`
      SELECT created_at::date AS day, COALESCE(SUM(cost_usd), 0) AS cost
        FROM ai_usage
       WHERE created_at >= NOW() - INTERVAL '14 days'
       GROUP BY day
       ORDER BY day
    `),
  ]);

  const row = totals.rows[0];
  const costMonth = toNumber(row.cost_month);
  const sessionsMonth = toInteger(sessionScope.rows[0].sessions_month);

  // Straight-line projection: what this month ends at if the rest of it looks
  // like the part already spent. Rough on purpose — it is an early warning, not
  // a forecast to budget against.
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedMonth = dayOfMonth > 0 ? (costMonth / dayOfMonth) * daysInMonth : 0;

  return {
    pricing: getAiPricing(),
    costTodayUsd: toNumber(row.cost_today),
    costMonthUsd: costMonth,
    costTotalUsd: toNumber(row.cost_total),
    projectedMonthUsd: projectedMonth,
    callsMonth: toInteger(row.calls_month),
    wastedCostMonthUsd: toNumber(wasted.rows[0].wasted_cost),
    wastedSessionsMonth: toInteger(wasted.rows[0].wasted_sessions),
    audioMinutesMonth: Math.round(toNumber(row.audio_seconds_month) / 60),
    sessionsMonth,
    costPerSessionUsd: sessionsMonth > 0 ? costMonth / sessionsMonth : 0,
    byOperation: byOperation.rows.map((operationRow) => ({
      operation: operationRow.operation,
      costUsd: toNumber(operationRow.cost),
      calls: toInteger(operationRow.calls),
    })),
    daily: daily.rows.map((dailyRow) => ({
      day: dailyRow.day instanceof Date ? dailyRow.day.toISOString() : dailyRow.day,
      costUsd: toNumber(dailyRow.cost),
    })),
  };
}
