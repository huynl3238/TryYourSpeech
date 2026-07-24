import { randomUUID } from 'crypto';
import pool from '../config/db.js';

const TOPIC_STATUSES = new Set(['open', 'draft', 'hidden']);
const TOPIC_SCOPES = new Set(['system', 'mentor_private']);
const PART_NUMBERS = new Set([1, 2, 3]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('field must be a string');
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requireTopicName(name) {
  if (!isNonEmptyString(name) || name.trim().length > 100) {
    throw new Error('Topic name is invalid');
  }

  return name.trim();
}

function normalizeTopicStatus(status) {
  if (status === undefined || status === null || status === '') {
    return 'open';
  }

  if (typeof status !== 'string' || !TOPIC_STATUSES.has(status)) {
    throw new Error('Topic status is invalid');
  }

  return status;
}

function normalizeTopicScope(scope, ownerId) {
  if (scope === undefined || scope === null || scope === '') {
    return ownerId ? 'mentor_private' : 'system';
  }

  if (typeof scope !== 'string' || !TOPIC_SCOPES.has(scope)) {
    throw new Error('Topic scope is invalid');
  }

  return scope;
}

function normalizePartNumber(partNumber) {
  const number = Number(partNumber);

  if (!Number.isInteger(number) || !PART_NUMBERS.has(number)) {
    throw new Error('partNumber is invalid');
  }

  return number;
}

function normalizeQuestionText(questionText) {
  if (!isNonEmptyString(questionText)) {
    throw new Error('questionText is required');
  }

  return questionText.trim();
}

function normalizeStringArray(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value
    .map((item) => {
      if (typeof item !== 'string') {
        throw new Error(`${fieldName} must contain strings`);
      }

      return item.trim();
    })
    .filter(Boolean);
}

function normalizeCueCard(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('cueCard must be an object');
  }

  const prompt = normalizeOptionalString(value.prompt);
  const bulletPoints = normalizeStringArray(value.bulletPoints || value.bullet_points, 'cueCard.bulletPoints');

  if (!prompt && bulletPoints.length === 0) {
    return null;
  }

  return {
    prompt: prompt || '',
    bullet_points: bulletPoints,
  };
}

function mapTopicRow(row) {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope || 'system',
    ownerId: row.owner_id ?? null,
    targetBand: row.target_band,
    status: row.status || 'open',
    questionCount: Number(row.question_count || 0),
    partCounts: {
      part1: Number(row.part1_count || 0),
      part2: Number(row.part2_count || 0),
      part3: Number(row.part3_count || 0),
    },
    usedInSessionCount: Number(row.session_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQuestionRow(row) {
  return {
    id: row.id,
    topicId: row.topic_id,
    partNumber: Number(row.part_number),
    questionText: row.question_text,
    cueCard: row.cue_card,
    suggestedPhrases: row.suggested_phrases || [],
    usedInTurnCount: Number(row.turn_count || 0),
  };
}

async function getTopicForPermission(client, topicId) {
  const result = await client.query(
    `
      SELECT id, owner_id, scope
      FROM topics
      WHERE id = $1
    `,
    [topicId]
  );

  return result.rows[0] || null;
}

async function getTopicForQuestionPermission(client, questionId) {
  const result = await client.query(
    `
      SELECT t.id, t.owner_id, t.scope
      FROM questions q
      JOIN topics t ON t.id = q.topic_id
      WHERE q.id = $1
    `,
    [questionId]
  );

  return result.rows[0] || null;
}

async function getUserRole(client, userId) {
  if (!isNonEmptyString(userId)) {
    return null;
  }

  const result = await client.query(
    `
      SELECT user_role
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  return result.rows[0]?.user_role || null;
}

async function requireTopicMutationPermission(client, { actorUserId, scope, ownerId }) {
  if (!isNonEmptyString(actorUserId)) {
    throw new Error('actorUserId is required');
  }

  const actorRole = await getUserRole(client, actorUserId);
  if (!actorRole) {
    throw new Error('Actor not found');
  }

  if (scope === 'system') {
    if (actorRole !== 'admin') {
      throw new Error('Only admin can manage system question sets');
    }
    return;
  }

  if (actorRole !== 'mentor') {
    throw new Error('Only mentor can manage mentor question sets');
  }

  if (ownerId !== actorUserId) {
    throw new Error('Mentor can only manage their own question sets');
  }
}

async function requireExistingTopicMutationPermission(client, { actorUserId, topicId }) {
  const topic = await getTopicForPermission(client, topicId);
  if (!topic) {
    throw new Error('Topic not found');
  }

  await requireTopicMutationPermission(client, {
    actorUserId,
    scope: topic.scope || 'system',
    ownerId: topic.owner_id,
  });

  return topic;
}

async function isTopicUsed(client, topicId) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS count
      FROM sessions
      WHERE topic_id = $1
    `,
    [topicId]
  );

  return result.rows[0].count > 0;
}

async function isQuestionUsed(client, questionId) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS count
      FROM turns
      WHERE question_id = $1
    `,
    [questionId]
  );

  return result.rows[0].count > 0;
}

export async function listTopics({ ownerId = null } = {}) {
  const params = [];
  let ownerFilter = '';

  if (ownerId) {
    params.push(ownerId);
    ownerFilter = "WHERE t.scope = 'system' OR (t.scope = 'mentor_private' AND t.owner_id = $1)";
  }

  const result = await pool.query(
    `
      SELECT
        t.id,
        t.name,
        t.scope,
        t.owner_id,
        t.target_band,
        t.status,
        t.created_at,
        t.updated_at,
        COUNT(DISTINCT q.id)::int AS question_count,
        COUNT(DISTINCT q.id) FILTER (WHERE q.part_number = 1)::int AS part1_count,
        COUNT(DISTINCT q.id) FILTER (WHERE q.part_number = 2)::int AS part2_count,
        COUNT(DISTINCT q.id) FILTER (WHERE q.part_number = 3)::int AS part3_count,
        COUNT(DISTINCT s.id)::int AS session_count
      FROM topics t
      LEFT JOIN questions q ON q.topic_id = t.id
      LEFT JOIN sessions s ON s.topic_id = t.id
      ${ownerFilter}
      GROUP BY t.id
      ORDER BY COALESCE(t.updated_at, t.created_at) DESC, t.name
    `,
    params
  );

  return {
    topics: result.rows.map(mapTopicRow),
  };
}

export async function getTopicDetail(topicId) {
  const client = await pool.connect();

  try {
    const topicResult = await client.query(
      `
        SELECT
          t.id,
          t.name,
          t.scope,
          t.owner_id,
          t.target_band,
          t.status,
          t.created_at,
          t.updated_at,
          COUNT(DISTINCT q.id)::int AS question_count,
          COUNT(DISTINCT q.id) FILTER (WHERE q.part_number = 1)::int AS part1_count,
          COUNT(DISTINCT q.id) FILTER (WHERE q.part_number = 2)::int AS part2_count,
          COUNT(DISTINCT q.id) FILTER (WHERE q.part_number = 3)::int AS part3_count,
          COUNT(DISTINCT s.id)::int AS session_count
        FROM topics t
        LEFT JOIN questions q ON q.topic_id = t.id
        LEFT JOIN sessions s ON s.topic_id = t.id
        WHERE t.id = $1
        GROUP BY t.id
      `,
      [topicId]
    );

    if (topicResult.rowCount === 0) {
      return null;
    }

    const questionsResult = await client.query(
      `
        SELECT
          q.id,
          q.topic_id,
          q.part_number,
          q.question_text,
          q.cue_card,
          q.suggested_phrases,
          COUNT(tr.id)::int AS turn_count
        FROM questions q
        LEFT JOIN turns tr ON tr.question_id = q.id
        WHERE q.topic_id = $1
        GROUP BY q.id
        ORDER BY q.part_number, q.id
      `,
      [topicId]
    );

    return {
      topic: mapTopicRow(topicResult.rows[0]),
      questions: questionsResult.rows.map(mapQuestionRow),
    };
  } finally {
    client.release();
  }
}

export async function createTopic({ name, targetBand, status, ownerId, scope, actorUserId }) {
  const requestedOwnerId = isNonEmptyString(ownerId) ? ownerId : null;
  const safeScope = normalizeTopicScope(scope, requestedOwnerId);
  const safeOwnerId = safeScope === 'system' ? null : requestedOwnerId;

  if (safeScope === 'mentor_private' && !safeOwnerId) {
    throw new Error('Mentor question set owner is required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await requireTopicMutationPermission(client, {
      actorUserId,
      scope: safeScope,
      ownerId: safeOwnerId,
    });

    const result = await client.query(
      `
        INSERT INTO topics (id, name, scope, owner_id, target_band, status, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING
          id,
          name,
          scope,
          owner_id,
          target_band,
          status,
          created_at,
          updated_at,
          0::int AS question_count,
          0::int AS part1_count,
          0::int AS part2_count,
          0::int AS part3_count,
          0::int AS session_count
      `,
      [
        randomUUID(),
        requireTopicName(name),
        safeScope,
        safeOwnerId,
        normalizeOptionalString(targetBand),
        normalizeTopicStatus(status),
      ]
    );

    await client.query('COMMIT');
    return { topic: mapTopicRow(result.rows[0]) };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new Error('Question set name already exists for this scope');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function updateTopic({ topicId, name, targetBand, status, actorUserId }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await requireExistingTopicMutationPermission(client, { actorUserId, topicId });

    const result = await client.query(
      `
        UPDATE topics
        SET name = $2,
            target_band = $3,
            status = $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          name,
          scope,
          owner_id,
          target_band,
          status,
          created_at,
          updated_at,
          0::int AS question_count,
          0::int AS part1_count,
          0::int AS part2_count,
          0::int AS part3_count,
          0::int AS session_count
      `,
      [
        topicId,
        requireTopicName(name),
        normalizeOptionalString(targetBand),
        normalizeTopicStatus(status),
      ]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('COMMIT');
    return await getTopicDetail(topicId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteTopic(topicId, { actorUserId } = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await requireExistingTopicMutationPermission(client, { actorUserId, topicId });

    if (await isTopicUsed(client, topicId)) {
      throw new Error('Topic is used by existing sessions');
    }

    await client.query('DELETE FROM questions WHERE topic_id = $1', [topicId]);
    await client.query('DELETE FROM topics WHERE id = $1', [topicId]);
    await client.query('COMMIT');

    return { deleted: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createQuestion({ topicId, partNumber, questionText, cueCard, suggestedPhrases, actorUserId }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await requireExistingTopicMutationPermission(client, { actorUserId, topicId });

    const result = await client.query(
      `
        INSERT INTO questions (id, topic_id, part_number, question_text, cue_card, suggested_phrases)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          topic_id,
          part_number,
          question_text,
          cue_card,
          suggested_phrases,
          0::int AS turn_count
      `,
      [
        randomUUID(),
        topicId,
        normalizePartNumber(partNumber),
        normalizeQuestionText(questionText),
        JSON.stringify(normalizeCueCard(cueCard)),
        JSON.stringify(normalizeStringArray(suggestedPhrases, 'suggestedPhrases')),
      ]
    );

    await client.query('UPDATE topics SET updated_at = NOW() WHERE id = $1', [topicId]);
    await client.query('COMMIT');

    return { question: mapQuestionRow(result.rows[0]) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateQuestion({ questionId, partNumber, questionText, cueCard, suggestedPhrases, actorUserId }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const topic = await getTopicForQuestionPermission(client, questionId);
    if (!topic) {
      await client.query('ROLLBACK');
      return null;
    }

    await requireTopicMutationPermission(client, {
      actorUserId,
      scope: topic.scope || 'system',
      ownerId: topic.owner_id,
    });

    const result = await client.query(
      `
        UPDATE questions q
        SET part_number = $2,
            question_text = $3,
            cue_card = $4,
            suggested_phrases = $5
        WHERE q.id = $1
        RETURNING
          q.id,
          q.topic_id,
          q.part_number,
          q.question_text,
          q.cue_card,
          q.suggested_phrases,
          (
            SELECT COUNT(*)::int
            FROM turns tr
            WHERE tr.question_id = q.id
          ) AS turn_count
      `,
      [
        questionId,
        normalizePartNumber(partNumber),
        normalizeQuestionText(questionText),
        JSON.stringify(normalizeCueCard(cueCard)),
        JSON.stringify(normalizeStringArray(suggestedPhrases, 'suggestedPhrases')),
      ]
    );

    await client.query('UPDATE topics SET updated_at = NOW() WHERE id = $1', [result.rows[0].topic_id]);
    await client.query('COMMIT');

    return { question: mapQuestionRow(result.rows[0]) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteQuestion(questionId, { actorUserId } = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const topic = await getTopicForQuestionPermission(client, questionId);

    if (!topic) {
      await client.query('ROLLBACK');
      return null;
    }

    await requireTopicMutationPermission(client, {
      actorUserId,
      scope: topic.scope || 'system',
      ownerId: topic.owner_id,
    });

    if (await isQuestionUsed(client, questionId)) {
      throw new Error('Question is used by existing turns');
    }

    await client.query('DELETE FROM questions WHERE id = $1', [questionId]);
    await client.query('UPDATE topics SET updated_at = NOW() WHERE id = $1', [topic.id]);
    await client.query('COMMIT');

    return { deleted: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
