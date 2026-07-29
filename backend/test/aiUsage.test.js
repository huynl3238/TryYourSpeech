import assert from 'node:assert/strict';
import test from 'node:test';
import pool from '../src/config/db.js';
import { getAiUsageSummary, recordAiUsage } from '../src/models/aiUsageModel.js';

async function canUseDatabase() {
  try {
    await pool.query('SELECT id FROM ai_usage LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

// Only ever deletes the rows these tests wrote: they are the only ones with
// neither a session nor a turn attached.
async function cleanup() {
  await pool.query('DELETE FROM ai_usage WHERE session_id IS NULL AND turn_id IS NULL');
}

test('recording usage never throws, so bookkeeping cannot break grading', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  // Every one of these violates the schema. The pipeline calls recordAiUsage
  // right after a real API call has already run; if that write could throw, a
  // bookkeeping bug would fail a session the learner already waited through.
  await recordAiUsage({ provider: 'nha-cung-cap-la', operation: 'transcription' });
  await recordAiUsage({ provider: 'openai', operation: 'khong-ton-tai' });
  await recordAiUsage({
    provider: 'openai',
    operation: 'transcription',
    sessionId: '11111111-1111-4111-8111-111111111111',
  });
});

test('audio and tokens are counted in the units the providers bill by', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const before = await getAiUsageSummary();

  try {
    await recordAiUsage({ provider: 'openai', operation: 'transcription', audioSeconds: 600 });
    await recordAiUsage({ provider: 'azure', operation: 'pronunciation', audioSeconds: 600 });
    await recordAiUsage({
      provider: 'openai',
      operation: 'feedback',
      inputTokens: 4000,
      outputTokens: 1000,
    });

    const after = await getAiUsageSummary();

    assert.equal(after.callsMonth - before.callsMonth, 3);
    assert.equal(after.callsToday - before.callsToday, 3);

    // 600 seconds is 10 minutes. Counted from the transcription call only:
    // the same recording goes to Azure too, and adding both would double-count
    // the audio the app actually handled.
    assert.equal(after.audioMinutesMonth - before.audioMinutesMonth, 10);
    assert.equal(after.audioMinutesToday - before.audioMinutesToday, 10);

    assert.equal(after.inputTokensMonth - before.inputTokensMonth, 4000);
    assert.equal(after.outputTokensMonth - before.outputTokensMonth, 1000);
  } finally {
    await cleanup();
  }
});

test('no figure claims to be money', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  // Guards the decision itself: providers do not report a price per call, so a
  // cost figure here could only ever be an estimate wearing the clothes of a
  // measurement. If someone reintroduces one, this fails loudly.
  const summary = await getAiUsageSummary();
  const keys = JSON.stringify(summary).toLowerCase();

  for (const forbidden of ['cost', 'usd', 'price', 'pricing']) {
    assert.equal(keys.includes(forbidden), false, `số liệu không được chứa "${forbidden}"`);
  }

  const columns = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_usage'"
  );
  const names = columns.rows.map((row) => row.column_name);
  assert.equal(names.includes('cost_usd'), false, 'bảng ai_usage không được có cột tiền');
});
