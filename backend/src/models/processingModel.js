import { randomUUID } from 'crypto';
import { prepareAiPipeline } from './aiPipelineModel.js';
import {
  getSessionStatus,
  markSessionCompletedIfAllResultsTerminal,
} from './sessionLifecycleModel.js';

async function hasBothReviewsCompleted(client, sessionId) {
  const result = await client.query(
    `
      SELECT user_a_review_done_at, user_b_review_done_at
      FROM sessions
      WHERE id = $1
    `,
    [sessionId]
  );

  const session = result.rows[0];
  if (!session) {
    return false;
  }

  return session.user_a_review_done_at !== null && session.user_b_review_done_at !== null;
}

async function getSessionMode(client, sessionId) {
  const result = await client.query(
    `
      SELECT session_mode
      FROM sessions
      WHERE id = $1
    `,
    [sessionId]
  );

  return result.rows[0]?.session_mode || 'peer';
}

async function hasAllAudioUploaded(client, sessionId) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS pending_count
      FROM turns
      WHERE session_id = $1 AND upload_status <> 'uploaded'
    `,
    [sessionId]
  );

  return result.rows[0].pending_count === 0;
}

async function getUploadedTurnIds(client, sessionId) {
  const result = await client.query(
    `
      SELECT id
      FROM turns
      WHERE session_id = $1 AND upload_status = 'uploaded'
      ORDER BY turn_index
    `,
    [sessionId]
  );

  return result.rows.map((row) => row.id);
}

async function createMissingAiResults(client, sessionId) {
  const turnIds = await getUploadedTurnIds(client, sessionId);

  for (const turnId of turnIds) {
    await client.query(
      `
        INSERT INTO ai_results (id, turn_id, status)
        VALUES ($1, $2, 'processing')
        ON CONFLICT (turn_id) DO NOTHING
      `,
      [randomUUID(), turnId]
    );
  }
}

export async function maybeStartSessionProcessing(client, sessionId) {
  const sessionMode = await getSessionMode(client, sessionId);
  if (sessionMode === 'mentor') {
    return 'not_required';
  }

  if (!(await hasBothReviewsCompleted(client, sessionId))) {
    return 'pending';
  }

  if (!(await hasAllAudioUploaded(client, sessionId))) {
    return 'pending';
  }

  await client.query(
    `
      UPDATE sessions
      SET status = 'processing'
      WHERE id = $1 AND status = 'reviewing'
    `,
    [sessionId]
  );

  await createMissingAiResults(client, sessionId);
  const pipeline = await prepareAiPipeline(client, sessionId);
  const completedStatus = await markSessionCompletedIfAllResultsTerminal(client, sessionId);

  if (pipeline.status) {
    return pipeline.status;
  }

  if (completedStatus) {
    return completedStatus;
  }

  return await getSessionStatus(client, sessionId);
}
