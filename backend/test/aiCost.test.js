import assert from 'node:assert/strict';
import test from 'node:test';
import pool from '../src/config/db.js';
import { calculateUsageCostUsd, getAiPricing } from '../src/config/aiPricing.js';
import { getAiCostSummary, recordAiUsage } from '../src/models/aiUsageModel.js';

async function canUseDatabase() {
  try {
    await pool.query('SELECT id FROM ai_usage LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

function withEnv(name, value, run) {
  const original = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  try {
    return run();
  } finally {
    if (original === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original;
    }
  }
}

test('each billed unit is priced by the unit the provider actually charges for', () => {
  const pricing = getAiPricing();

  // Transcription is per minute of audio.
  assert.equal(
    calculateUsageCostUsd({ operation: 'transcription', audioSeconds: 120 }),
    2 * pricing.transcriptionPerMinuteUsd
  );

  // Azure is per hour of audio — a different denominator, which is exactly the
  // mistake this asserts against.
  assert.equal(
    calculateUsageCostUsd({ operation: 'pronunciation', audioSeconds: 1800 }),
    0.5 * pricing.pronunciationPerAudioHourUsd
  );

  // Feedback is per token, and input and output are priced differently.
  assert.equal(
    calculateUsageCostUsd({ operation: 'feedback', inputTokens: 1_000_000, outputTokens: 500_000 }),
    pricing.feedbackInputPerMillionTokensUsd + 0.5 * pricing.feedbackOutputPerMillionTokensUsd
  );

  // Audio length must not leak into a token-priced call, or vice versa.
  assert.equal(calculateUsageCostUsd({ operation: 'feedback', audioSeconds: 9999 }), 0);
  assert.equal(calculateUsageCostUsd({ operation: 'transcription', inputTokens: 9999 }), 0);
});

test('a broken price override falls back instead of pricing everything at zero', () => {
  withEnv('AI_PRICE_TRANSCRIPTION_PER_MINUTE_USD', '0.05', () => {
    assert.equal(getAiPricing().transcriptionPerMinuteUsd, 0.05);
  });

  // A typo in .env silently reporting $0.00 would look exactly like "the AI is
  // free", which is the most expensive thing this dashboard could get wrong.
  for (const bad of ['khong-phai-so', '-1', '']) {
    withEnv('AI_PRICE_TRANSCRIPTION_PER_MINUTE_USD', bad, () => {
      assert.ok(getAiPricing().transcriptionPerMinuteUsd > 0, `giá trị "${bad}" phải quay về mặc định`);
    });
  }
});

test('recording usage never throws, so accounting cannot break grading', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  // Every one of these violates the schema. The pipeline calls recordAiUsage
  // right after paying for a real API call; if that write could throw, a
  // bookkeeping bug would fail a session the user already waited for.
  await recordAiUsage({ provider: 'nha-cung-cap-la', operation: 'transcription' });
  await recordAiUsage({ provider: 'openai', operation: 'khong-ton-tai' });
  await recordAiUsage({
    provider: 'openai',
    operation: 'transcription',
    sessionId: '11111111-1111-4111-8111-111111111111',
  });
});

test('spend lands in both the daily and the monthly total', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const before = await getAiCostSummary();

  try {
    // 10 minutes of audio through both audio services, plus one feedback call.
    await recordAiUsage({ provider: 'openai', operation: 'transcription', audioSeconds: 600 });
    await recordAiUsage({ provider: 'azure', operation: 'pronunciation', audioSeconds: 600 });
    await recordAiUsage({
      provider: 'openai',
      operation: 'feedback',
      inputTokens: 4000,
      outputTokens: 1000,
    });

    const after = await getAiCostSummary();
    const pricing = getAiPricing();
    const expected =
      10 * pricing.transcriptionPerMinuteUsd +
      (600 / 3600) * pricing.pronunciationPerAudioHourUsd +
      (4000 / 1_000_000) * pricing.feedbackInputPerMillionTokensUsd +
      (1000 / 1_000_000) * pricing.feedbackOutputPerMillionTokensUsd;

    // Six decimal places is what the column stores, so allow rounding at that scale.
    const delta = after.costTodayUsd - before.costTodayUsd;
    assert.ok(Math.abs(delta - expected) < 0.00001, `chi phí hôm nay lệch: ${delta} vs ${expected}`);

    // Anything spent today is also spent this month; a total that misses it
    // would under-report the bill.
    assert.ok(after.costMonthUsd - before.costMonthUsd >= delta - 0.00001);
    assert.equal(after.callsMonth - before.callsMonth, 3);

    // The breakdown has to add up to the same money, or "tiền đi đâu" lies.
    const byOperation = after.byOperation.reduce((total, row) => total + row.costUsd, 0);
    assert.ok(Math.abs(byOperation - after.costMonthUsd) < 0.00001);
  } finally {
    // Only the rows this test wrote: they have no session and no turn attached.
    await pool.query('DELETE FROM ai_usage WHERE session_id IS NULL AND turn_id IS NULL');
  }
});
