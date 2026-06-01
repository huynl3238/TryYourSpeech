import { randomUUID } from 'crypto';
import pool from '../config/db.js';

const TEST_TURNS_PER_USER = 3;
const TEST_TURN_DURATION_MS = 30000;
const TEST_SHORT_PREP_DURATION_MS = 30000;
const TEST_LONG_PREP_DURATION_MS = 60000;

function mapSessionRow(row) {
  return {
    id: row.id,
    status: row.status,
    userAId: row.user_a_id,
    userBId: row.user_b_id,
  };
}

function mapParticipant(row, role) {
  return {
    id: row.id,
    displayName: row.display_name,
    band: row.band === null ? null : Number(row.band),
    role,
  };
}

function mapTurnRow(row) {
  return {
    id: row.id,
    turnIndex: row.turn_index,
    speakerId: row.speaker_id,
    speakerRole: row.speaker_role,
    questionId: row.question_id,
    partNumber: row.part_number,
    questionText: row.question_text,
    cueCard: row.cue_card,
    suggestedPhrases: row.suggested_phrases || [],
    durationMs: row.duration_ms,
    prepDurationMs: row.prep_duration_ms,
  };
}

async function createUser(client, user) {
  const id = randomUUID();

  const result = await client.query(
    `
      INSERT INTO users (id, display_name, band)
      VALUES ($1, $2, $3)
      RETURNING id, display_name, band
    `,
    [id, user.displayName, user.band]
  );

  return result.rows[0];
}

async function selectEligibleTopic(client) {
  const result = await client.query(`
    SELECT t.id, t.name
    FROM topics t
    JOIN questions q ON q.topic_id = t.id
    GROUP BY t.id, t.name
    HAVING
      COUNT(*) FILTER (WHERE q.part_number = 1) >= 1 AND
      COUNT(*) FILTER (WHERE q.part_number = 2) >= 1 AND
      COUNT(*) FILTER (WHERE q.part_number = 3) >= 1
    ORDER BY RANDOM()
    LIMIT 1
  `);

  return result.rows[0] || null;
}

async function selectSessionQuestions(client, topicId) {
  const part1 = await client.query(
    `
      SELECT id, part_number
      FROM questions
      WHERE topic_id = $1 AND part_number = 1
      ORDER BY id
      LIMIT 1
    `,
    [topicId]
  );
  const part2 = await client.query(
    `
      SELECT id, part_number
      FROM questions
      WHERE topic_id = $1 AND part_number = 2
      ORDER BY id
      LIMIT 1
    `,
    [topicId]
  );
  const part3 = await client.query(
    `
      SELECT id, part_number
      FROM questions
      WHERE topic_id = $1 AND part_number = 3
      ORDER BY id
      LIMIT 1
    `,
    [topicId]
  );

  return [...part1.rows, ...part2.rows, ...part3.rows].slice(0, TEST_TURNS_PER_USER);
}

function getTurnDurations(partNumber) {
  const prepDurationMs = partNumber === 2
    ? TEST_LONG_PREP_DURATION_MS
    : TEST_SHORT_PREP_DURATION_MS;

  return {
    durationMs: TEST_TURN_DURATION_MS,
    prepDurationMs,
  };
}

async function createTurns(client, sessionId, userAId, userBId, questions) {
  let turnIndex = 1;

  for (const question of questions) {
    const { durationMs, prepDurationMs } = getTurnDurations(question.part_number);
    const speakers = [
      { id: userAId, role: 'A' },
      { id: userBId, role: 'B' },
    ];

    for (const speaker of speakers) {
      await client.query(
        `
          INSERT INTO turns (
            id,
            session_id,
            speaker_id,
            speaker_role,
            question_id,
            part_number,
            turn_index,
            duration_ms,
            prep_duration_ms
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          randomUUID(),
          sessionId,
          speaker.id,
          speaker.role,
          question.id,
          question.part_number,
          turnIndex,
          durationMs,
          prepDurationMs,
        ]
      );

      turnIndex += 1;
    }
  }
}

export async function createMatchedSession(roomId, userA, userB) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const topic = await selectEligibleTopic(client);
    if (!topic) {
      throw new Error('Chưa có đủ câu hỏi để tạo phiên luyện tập');
    }

    const createdUserA = await createUser(client, userA);
    const createdUserB = await createUser(client, userB);

    const sessionId = randomUUID();
    await client.query(
      `
        INSERT INTO sessions (id, room_id, user_a_id, user_b_id, topic_id, status)
        VALUES ($1, $2, $3, $4, $5, 'matched')
      `,
      [sessionId, roomId, createdUserA.id, createdUserB.id, topic.id]
    );

    const questions = await selectSessionQuestions(client, topic.id);
    await createTurns(client, sessionId, createdUserA.id, createdUserB.id, questions);

    await client.query('COMMIT');

    return {
      sessionId,
      topic,
      userA: createdUserA,
      userB: createdUserB,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function markSessionActive(sessionId) {
  await pool.query(
    `
      UPDATE sessions
      SET status = 'active', started_at = NOW()
      WHERE id = $1 AND status = 'matched'
    `,
    [sessionId]
  );
}

export async function markSessionAbandoned(sessionId) {
  await pool.query(
    `
      UPDATE sessions
      SET status = 'abandoned', ended_at = NOW()
      WHERE id = $1 AND status IN ('matched', 'active', 'reviewing')
    `,
    [sessionId]
  );
}

export async function getSessionDetail(sessionId) {
  const sessionResult = await pool.query(
    `
      SELECT
        s.id,
        s.status,
        s.user_a_id,
        s.user_b_id,
        t.id AS topic_id,
        t.name AS topic_name
      FROM sessions s
      JOIN topics t ON t.id = s.topic_id
      WHERE s.id = $1
    `,
    [sessionId]
  );

  const sessionRow = sessionResult.rows[0];
  if (!sessionRow) {
    return null;
  }

  const participantsResult = await pool.query(
    `
      SELECT id, display_name, band
      FROM users
      WHERE id IN ($1, $2)
    `,
    [sessionRow.user_a_id, sessionRow.user_b_id]
  );
  const userA = participantsResult.rows.find((row) => row.id === sessionRow.user_a_id);
  const userB = participantsResult.rows.find((row) => row.id === sessionRow.user_b_id);

  const turnsResult = await pool.query(
    `
      SELECT
        tr.id,
        tr.turn_index,
        tr.speaker_id,
        tr.speaker_role,
        tr.question_id,
        tr.part_number,
        tr.duration_ms,
        tr.prep_duration_ms,
        q.question_text,
        q.cue_card,
        q.suggested_phrases
      FROM turns tr
      JOIN questions q ON q.id = tr.question_id
      WHERE tr.session_id = $1
      ORDER BY tr.turn_index
    `,
    [sessionId]
  );

  return {
    session: mapSessionRow(sessionRow),
    topic: {
      id: sessionRow.topic_id,
      name: sessionRow.topic_name,
    },
    participants: [
      mapParticipant(userA, 'A'),
      mapParticipant(userB, 'B'),
    ],
    turns: turnsResult.rows.map(mapTurnRow),
  };
}
