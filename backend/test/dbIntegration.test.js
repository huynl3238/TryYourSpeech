import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pool from '../src/config/db.js';
import {
  createMatchedSession,
  getSessionDetail,
  markSessionActive,
} from '../src/models/sessionModel.js';
import { completeReview, savePeerNotesBatch } from '../src/models/reviewModel.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dbDir = join(currentDir, '..', 'src', 'db');

async function canUseDatabase() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function prepareDatabase() {
  const schemaSql = await readFile(join(dbDir, 'schema.sql'), 'utf8');
  const seedSql = await readFile(join(dbDir, 'seed.sql'), 'utf8');

  await pool.query(schemaSql);
  await pool.query(seedSql);
}

async function cleanupSession(session) {
  if (!session) {
    return;
  }

  await pool.query(
    `
      DELETE FROM peer_notes
      WHERE turn_id IN (
        SELECT id
        FROM turns
        WHERE session_id = $1
      )
    `,
    [session.sessionId]
  );
  await pool.query(
    `
      DELETE FROM ai_results
      WHERE turn_id IN (
        SELECT id
        FROM turns
        WHERE session_id = $1
      )
    `,
    [session.sessionId]
  );
  await pool.query('DELETE FROM turns WHERE session_id = $1', [session.sessionId]);
  await pool.query('DELETE FROM sessions WHERE id = $1', [session.sessionId]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [
    session.userA.id,
    session.userB.id,
  ]);
}

test('database flow creates session, stores idempotent peer notes, and completes reviews', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('PostgreSQL local database is not available');
    return;
  }

  await prepareDatabase();

  let session = null;

  try {
    session = await createMatchedSession(
      'integration-test-room',
      { displayName: 'Integration A', band: 6.5 },
      { displayName: 'Integration B', band: 6 }
    );
    const detail = await getSessionDetail(session.sessionId);

    assert.equal(detail.session.status, 'matched');
    assert.equal(detail.participants.length, 2);
    assert.equal(detail.turns.length, 6);
    assert.ok(detail.turns.every((turn) => turn.durationMs === 30000));
    assert.deepEqual(
      detail.turns.map((turn) => turn.partNumber),
      [1, 1, 2, 2, 3, 3]
    );
    assert.deepEqual(
      detail.turns.map((turn) => turn.prepDurationMs),
      [30000, 30000, 60000, 60000, 30000, 30000]
    );

    await markSessionActive(session.sessionId);

    const speakerATurn = detail.turns.find((turn) => turn.speakerRole === 'A');
    const firstSave = await savePeerNotesBatch({
      sessionId: session.sessionId,
      listenerId: session.userB.id,
      notes: [{
        clientNoteId: 'integration-note-1',
        turnId: speakerATurn.id,
        timestampMs: 1200,
        errorType: 'pronunciation',
        noteText: 'Final sound is unclear',
      }],
    });
    const retrySave = await savePeerNotesBatch({
      sessionId: session.sessionId,
      listenerId: session.userB.id,
      notes: [{
        clientNoteId: 'integration-note-1',
        turnId: speakerATurn.id,
        timestampMs: 1200,
        errorType: 'pronunciation',
        noteText: 'Final sound is unclear',
      }],
    });

    assert.equal(firstSave.saved, 1);
    assert.equal(retrySave.saved, 0);

    const userAReview = await completeReview({
      sessionId: session.sessionId,
      userId: session.userA.id,
    });
    const userBReview = await completeReview({
      sessionId: session.sessionId,
      userId: session.userB.id,
    });
    const reviewedDetail = await getSessionDetail(session.sessionId);

    assert.equal(userAReview.bothCompleted, false);
    assert.equal(userBReview.bothCompleted, true);
    assert.equal(reviewedDetail.session.status, 'reviewing');
  } finally {
    await cleanupSession(session);
  }
});
