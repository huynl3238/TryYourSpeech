import { randomUUID } from 'crypto';
import pool from '../config/db.js';

// Đúng thời lượng IELTS Speaking thật (AGENTS.md "Phase 3 — Luyện nói"). Part 1
// và Part 3 hỏi rồi trả lời ngay nên không có thời gian chuẩn bị; chỉ Part 2 có
// một phút đọc cue card. Trước đây mọi lượt đều là 30 giây kèm 30 giây chuẩn bị
// — chế độ test, không phải format thật.
const PART_FORMAT = {
  1: { questions: 4, durationMs: 45000, prepDurationMs: 0 },
  2: { questions: 1, durationMs: 120000, prepDurationMs: 60000 },
  3: { questions: 3, durationMs: 60000, prepDurationMs: 0 },
};

const FOCUS_PARTS = {
  part1: [1],
  part2: [2],
  part3: [3],
  full: [1, 2, 3],
};

export const SESSION_FOCUSES = Object.keys(FOCUS_PARTS);

function getFocusParts(focus) {
  return FOCUS_PARTS[focus] || FOCUS_PARTS.full;
}

function mapSessionRow(row) {
  return {
    id: row.id,
    status: row.status,
    sessionMode: row.session_mode || 'peer',
    focus: row.focus || 'full',
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

// Bộ câu hỏi chỉ hợp lệ khi có đủ số câu cho đúng phần được chọn. Đòi đủ chứ
// không đòi "ít nhất một câu" là có lý do: một buổi Part 1 chỉ có một câu hỏi
// dài 90 giây, không ai nhận ra đó là Part 1. Chọn Part 2 thì một bộ chỉ có
// cue card cũng dùng được, dù nó không đủ cho buổi đầy đủ.
async function selectEligibleTopic(client, focus = 'full') {
  const having = getFocusParts(focus)
    .map((part) => `COUNT(*) FILTER (WHERE q.part_number = ${part}) >= ${PART_FORMAT[part].questions}`)
    .join(' AND ');

  const result = await client.query(`
    SELECT t.id, t.name
    FROM topics t
    JOIN questions q ON q.topic_id = t.id
    WHERE COALESCE(t.status, 'open') = 'open'
      AND COALESCE(t.scope, 'system') = 'system'
    GROUP BY t.id, t.name
    HAVING ${having}
    ORDER BY RANDOM()
    LIMIT 1
  `);

  return result.rows[0] || null;
}

// Lấy đúng số câu của từng phần được chọn, theo thứ tự Part 1 -> 2 -> 3. Trả về
// một mảng phẳng vì `createTurns` chỉ cần biết thứ tự câu hỏi.
//
// Random trong từng phần, không phải `ORDER BY id`. Chủ đề đã được chọn random
// từ trước, nhưng trong một chủ đề thì `ORDER BY id LIMIT n` luôn trả về đúng n
// câu đầu tiên — nên luyện lại cùng chủ đề là gặp lại y nguyên bộ câu hỏi cũ,
// và những câu có id lớn hơn thì không bao giờ được dùng. Random đặt trong vòng
// lặp từng phần nên thứ tự Part 1 -> 2 -> 3 giữa các phần vẫn được giữ.
async function selectSessionQuestions(client, topicId, focus = 'full') {
  const questions = [];

  for (const part of getFocusParts(focus)) {
    const result = await client.query(
      `
        SELECT id, part_number
        FROM questions
        WHERE topic_id = $1 AND part_number = $2
        ORDER BY RANDOM()
        LIMIT $3
      `,
      [topicId, part, PART_FORMAT[part].questions]
    );
    questions.push(...result.rows);
  }

  return questions;
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
  const format = PART_FORMAT[partNumber] || PART_FORMAT[1];

  return {
    durationMs: format.durationMs,
    prepDurationMs: format.prepDurationMs,
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

export async function createMatchedSession(roomId, userA, userB, sessionMode = 'peer', focus = 'full') {
  const safeFocus = FOCUS_PARTS[focus] ? focus : 'full';
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const topic = await selectEligibleTopic(client, safeFocus);
    if (!topic) {
      throw new Error('Chưa có bộ câu hỏi nào đủ câu cho phần luyện đã chọn');
    }

    const createdUserA = await syncSessionUser(client, userA);
    const createdUserB = await syncSessionUser(client, userB);

    if (createdUserA.id === createdUserB.id) {
      throw new Error('Không thể ghép một người với chính họ');
    }

    const sessionId = randomUUID();
    await client.query(
      `
        INSERT INTO sessions (id, room_id, user_a_id, user_b_id, topic_id, session_mode, focus, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'matched')
      `,
      [sessionId, roomId, createdUserA.id, createdUserB.id, topic.id, sessionMode, safeFocus]
    );

    const questions = await selectSessionQuestions(client, topic.id, safeFocus);
    if (sessionMode === 'mentor') {
      await createMentorTurns(client, sessionId, createdUserA.id, questions);
    } else {
      await createTurns(client, sessionId, createdUserA.id, createdUserB.id, questions);
    }

    await client.query('COMMIT');

    return {
      sessionId,
      topic,
      focus: safeFocus,
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
      INSERT INTO sessions (id, room_id, user_a_id, user_b_id, topic_id, session_mode, focus, status)
      VALUES ($1, $2, $3, $4, $5, 'mentor', $6, 'matched')
    `,
    [sessionId, roomId, studentId, mentorId, topic.id, FOCUS_PARTS[focus] ? focus : 'full']
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
        s.focus,
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
