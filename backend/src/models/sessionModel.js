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
    sessionMode: row.session_mode || 'peer',
    userAId: row.user_a_id,
    userBId: row.user_b_id,
  };
}

function mapParticipant(row, role) {
  return {
    id: row.id,
    displayName: row.display_name,
    band: row.band === null ? null : Number(row.band),
    userRole: row.user_role || 'student',
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

// Matchmaking used to INSERT a throwaway users row per session, taking
// display_name/band/user_role straight from the socket payload — which is how
// the app ended up with one identity per device and a way to self-declare a
// role. Participants are now real signed-in accounts; the only thing a match
// may write back is the band the learner chose for this session.
async function syncSessionUser(client, user) {
  if (!user.userId) {
    throw new Error('Phiên luyện tập cần tài khoản đã đăng nhập');
  }

  const result = await client.query(
    `
      UPDATE users
      SET band = COALESCE($2, band)
      WHERE id = $1
      RETURNING id, display_name, band, user_role
    `,
    [user.userId, user.band]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Không tìm thấy tài khoản người dùng');
  }

  return row;
}

async function selectEligibleTopic(client) {
  const result = await client.query(`
    SELECT t.id, t.name
    FROM topics t
    JOIN questions q ON q.topic_id = t.id
    WHERE COALESCE(t.status, 'open') = 'open'
      AND COALESCE(t.scope, 'system') = 'system'
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

// Mentor sessions use the mentor's selected focus. A focused session runs only
// that IELTS part; a full session runs every question in Part 1 -> 2 -> 3 order.
function getMentorFocusPartNumber(focus) {
  if (focus === 'part1') return 1;
  if (focus === 'part2') return 2;
  if (focus === 'part3') return 3;
  return null;
}

async function selectMentorQuestions(client, topicId, focus) {
  const partNumber = getMentorFocusPartNumber(focus);
  const params = [topicId];
  let partFilter = '';

  if (partNumber !== null) {
    params.push(partNumber);
    partFilter = 'AND part_number = $2';
  }

  const result = await client.query(
    `
      SELECT id, part_number
      FROM questions
      WHERE topic_id = $1
        ${partFilter}
      ORDER BY part_number, id
    `,
    params
  );

  return result.rows;
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

async function createMentorTurns(client, sessionId, studentId, questions) {
  let turnIndex = 1;

  for (const question of questions) {
    const { durationMs, prepDurationMs } = getTurnDurations(question.part_number);

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
        VALUES ($1, $2, $3, 'A', $4, $5, $6, $7, $8)
      `,
      [
        randomUUID(),
        sessionId,
        studentId,
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

export async function createMatchedSession(roomId, userA, userB, sessionMode = 'peer') {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const topic = await selectEligibleTopic(client);
    if (!topic) {
      throw new Error('Chưa có đủ câu hỏi để tạo phiên luyện tập');
    }

    const createdUserA = await syncSessionUser(client, userA);
    const createdUserB = await syncSessionUser(client, userB);

    if (createdUserA.id === createdUserB.id) {
      throw new Error('Không thể ghép một người với chính họ');
    }

    const sessionId = randomUUID();
    await client.query(
      `
        INSERT INTO sessions (id, room_id, user_a_id, user_b_id, topic_id, session_mode, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'matched')
      `,
      [sessionId, roomId, createdUserA.id, createdUserB.id, topic.id, sessionMode]
    );

    const questions = await selectSessionQuestions(client, topic.id);
    if (sessionMode === 'mentor') {
      await createMentorTurns(client, sessionId, createdUserA.id, questions);
    } else {
      await createTurns(client, sessionId, createdUserA.id, createdUserB.id, questions);
    }

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

// Create a real mentor-led practice session from users that already exist
// (the mentor and the student they picked from the queue). Reuses the private
// question/turn helpers above. Must be called inside an open transaction.
export async function insertMentorSessionWithClient(client, { mentorId, studentId, topicId = null, focus = 'full' }) {
  if (!topicId) {
    throw new Error('Phiên mentor cần một bộ câu hỏi');
  }

  const chosen = await client.query(
    `
      SELECT id, name, scope, owner_id
      FROM topics
      WHERE id = $1
        AND COALESCE(status, 'open') = 'open'
        AND (
          COALESCE(scope, 'system') = 'system'
          OR (scope = 'mentor_private' AND owner_id = $2)
        )
    `,
    [topicId, mentorId]
  );
  const topic = chosen.rows[0] || null;
  if (!topic) {
    throw new Error('Không tìm thấy bộ câu hỏi của phiên');
  }

  const questions = await selectMentorQuestions(client, topic.id, focus);
  if (questions.length === 0) {
    throw new Error('Bộ câu hỏi này chưa có câu phù hợp với phần luyện đã chọn');
  }

  const sessionId = randomUUID();
  const roomId = `mentor-${sessionId.slice(0, 8)}`;

  await client.query(
    `
      INSERT INTO sessions (id, room_id, user_a_id, user_b_id, topic_id, session_mode, status)
      VALUES ($1, $2, $3, $4, $5, 'mentor', 'matched')
    `,
    [sessionId, roomId, studentId, mentorId, topic.id]
  );

  await createMentorTurns(client, sessionId, studentId, questions);

  return { sessionId, roomId, topic };
}

// Look up both participants of a session so the socket layer can build the
// realtime room when a mentor starts a session picked via REST.
export async function getMentorRoomParticipants(sessionId) {
  const result = await pool.query(
    `
      SELECT
        s.room_id, s.status, s.session_mode,
        ua.id AS ua_id, ua.display_name AS ua_name, ua.band AS ua_band, ua.user_role AS ua_role,
        ub.id AS ub_id, ub.display_name AS ub_name, ub.band AS ub_band, ub.user_role AS ub_role
      FROM sessions s
      JOIN users ua ON ua.id = s.user_a_id
      JOIN users ub ON ub.id = s.user_b_id
      WHERE s.id = $1
    `,
    [sessionId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    roomId: row.room_id,
    status: row.status,
    sessionMode: row.session_mode || 'peer',
    userA: {
      id: row.ua_id,
      displayName: row.ua_name,
      band: row.ua_band === null ? null : Number(row.ua_band),
      userRole: row.ua_role || 'student',
    },
    userB: {
      id: row.ub_id,
      displayName: row.ub_name,
      band: row.ub_band === null ? null : Number(row.ub_band),
      userRole: row.ub_role || 'student',
    },
  };
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

// Deliberately stops at 'active'. A session in 'reviewing' has already been
// practised and recorded — the two of them just have not finished marking each
// other's errors yet. Abandoning it there threw away completed work: review
// completion rejects an abandoned session, so neither side could finish and the
// AI, which only runs once both reviews are in, never ran at all. One person
// refreshing the page was enough to trigger it.
export async function markSessionAbandoned(sessionId) {
  await pool.query(
    `
      UPDATE sessions
      SET status = 'abandoned', ended_at = NOW()
      WHERE id = $1 AND status IN ('matched', 'active')
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
        s.session_mode,
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
      SELECT id, display_name, band, user_role
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
