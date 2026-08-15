import { randomUUID } from 'crypto';
import pool from '../config/db.js';
import { createNotification } from './notificationModel.js';
import { insertMentorSessionWithClient } from './sessionModel.js';

const FOCUS_VALUES = new Set(['part1', 'part2', 'part3', 'full']);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function toBandOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 9) {
    throw new Error('Band mục tiêu không hợp lệ');
  }

  return number;
}

function focusLabel(focus) {
  if (focus === 'full') return 'Full test';
  return `Part ${focus.slice(-1)}`;
}

function hasQuestionsForFocus(topicRow, focus) {
  if (focus === 'part1') return Number(topicRow.part1_count) > 0;
  if (focus === 'part2') return Number(topicRow.part2_count) > 0;
  if (focus === 'part3') return Number(topicRow.part3_count) > 0;

  return (
    Number(topicRow.part1_count) > 0 &&
    Number(topicRow.part2_count) > 0 &&
    Number(topicRow.part3_count) > 0
  );
}

function isBandWithinTarget(studentBand, session) {
  if (studentBand === null || studentBand === undefined) {
    return false;
  }

  const band = Number(studentBand);
  const min = session.target_band_min === null ? null : Number(session.target_band_min);
  const max = session.target_band_max === null ? null : Number(session.target_band_max);

  if (min !== null && band < min) return false;
  if (max !== null && band > max) return false;
  return true;
}

async function getUser(client, userId) {
  const result = await client.query(
    'SELECT id, display_name, band, user_role FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

function mapMentorSession(row) {
  const bandMin = row.target_band_min === null ? null : Number(row.target_band_min);
  const bandMax = row.target_band_max === null ? null : Number(row.target_band_max);

  return {
    id: row.id,
    mentorId: row.mentor_id,
    mentorName: row.mentor_display_name || null,
    mentorBand: row.mentor_band === null || row.mentor_band === undefined
      ? null
      : Number(row.mentor_band),
    focus: row.focus,
    focusLabel: focusLabel(row.focus),
    targetBandMin: bandMin,
    targetBandMax: bandMax,
    topicId: row.topic_id,
    status: row.status,
    sessionId: row.session_id,
    chosenStudentId: row.chosen_student_id,
    applicantCount: row.applicant_count === undefined ? undefined : Number(row.applicant_count),
    createdAt: toIsoString(row.created_at),
    startedAt: toIsoString(row.started_at),
  };
}

// --- Mentor opens a session ---------------------------------------------
export async function openMentorSession({ mentorId, focus = 'part2', targetBandMin, targetBandMax, topicId }) {
  if (!isNonEmptyString(mentorId)) {
    throw new Error('mentorId is required');
  }

  const safeFocus = isNonEmptyString(focus) ? focus.trim() : 'part2';
  if (!FOCUS_VALUES.has(safeFocus)) {
    throw new Error('focus is invalid');
  }

  const bandMin = toBandOrNull(targetBandMin);
  const bandMax = toBandOrNull(targetBandMax);
  if (bandMin !== null && bandMax !== null && bandMin > bandMax) {
    throw new Error('Band mục tiêu không hợp lệ');
  }

  const client = await pool.connect();
  try {
    const mentor = await getUser(client, mentorId);
    if (!mentor) {
      throw new Error('Mentor not found');
    }
    if (mentor.user_role !== 'mentor') {
      throw new Error('Chỉ mentor mới được mở phiên học');
    }

    if (!isNonEmptyString(topicId)) {
      throw new Error('Vui lòng chọn bộ câu hỏi cho phiên học');
    }
    const topic = await client.query(
      `
        SELECT
          t.id,
          t.owner_id,
          t.scope,
          t.status,
          COUNT(q.id)::int AS question_count,
          COUNT(q.id) FILTER (WHERE q.part_number = 1)::int AS part1_count,
          COUNT(q.id) FILTER (WHERE q.part_number = 2)::int AS part2_count,
          COUNT(q.id) FILTER (WHERE q.part_number = 3)::int AS part3_count
        FROM topics t
        LEFT JOIN questions q ON q.topic_id = t.id
        WHERE t.id = $1
        GROUP BY t.id
      `,
      [topicId]
    );
    if (topic.rowCount === 0) {
      throw new Error('Không tìm thấy bộ câu hỏi');
    }
    const topicRow = topic.rows[0];
    if (topicRow.status !== 'open') {
      throw new Error('Question set is not open');
    }
    if (
      topicRow.scope !== 'system' &&
      !(topicRow.scope === 'mentor_private' && topicRow.owner_id === mentorId)
    ) {
      throw new Error('Mentor can only use system question sets or their own sets');
    }
    if (topicRow.question_count === 0) {
      throw new Error('Bộ câu hỏi này chưa có câu nào, hãy thêm câu hỏi trước');
    }
    if (!hasQuestionsForFocus(topicRow, safeFocus)) {
      throw new Error('Bộ câu hỏi này chưa có câu phù hợp với phần luyện đã chọn');
    }
    const safeTopicId = topicId;

    const result = await client.query(
      `
        INSERT INTO mentor_sessions
          (id, mentor_id, focus, target_band_min, target_band_max, topic_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'open')
        RETURNING *
      `,
      [randomUUID(), mentorId, safeFocus, bandMin, bandMax, safeTopicId]
    );

    return { mentorSession: mapMentorSession({ ...result.rows[0], applicant_count: 0 }) };
  } finally {
    client.release();
  }
}

// --- Student view: open sessions ----------------------------------------
export async function listOpenMentorSessions({ studentId = null } = {}) {
  const result = await pool.query(
    `
      SELECT
        ms.*,
        mentor.display_name AS mentor_display_name,
        mentor.band AS mentor_band,
        COUNT(app.student_id) FILTER (WHERE app.status = 'waiting')::int AS applicant_count,
        BOOL_OR(app.student_id = $1) AS has_applied
      FROM mentor_sessions ms
      JOIN users mentor ON mentor.id = ms.mentor_id
      LEFT JOIN mentor_session_applicants app ON app.mentor_session_id = ms.id
      WHERE ms.status IN ('open', 'started')
      GROUP BY ms.id, mentor.display_name, mentor.band
      ORDER BY
        CASE ms.status WHEN 'open' THEN 0 ELSE 1 END,
        ms.created_at DESC
      LIMIT 50
    `,
    [studentId]
  );

  return {
    mentorSessions: result.rows.map((row) => ({
      ...mapMentorSession(row),
      hasApplied: Boolean(row.has_applied),
      chosenIsMe: studentId ? row.chosen_student_id === studentId : false,
    })),
  };
}

// --- Mentor view: my hosted sessions + queues ---------------------------
export async function listMentorHostedSessions({ mentorId }) {
  if (!isNonEmptyString(mentorId)) {
    throw new Error('mentorId is required');
  }

  const sessionsResult = await pool.query(
    `
      SELECT ms.*, mentor.display_name AS mentor_display_name, mentor.band AS mentor_band
      FROM mentor_sessions ms
      JOIN users mentor ON mentor.id = ms.mentor_id
      WHERE ms.mentor_id = $1 AND ms.status IN ('open', 'started')
      ORDER BY ms.created_at DESC
      LIMIT 20
    `,
    [mentorId]
  );

  const sessions = sessionsResult.rows.map(mapMentorSession);
  if (sessions.length === 0) {
    return { mentorSessions: [] };
  }

  const ids = sessions.map((session) => session.id);
  const applicantsResult = await pool.query(
    `
      SELECT app.mentor_session_id, app.student_id, app.status, app.created_at,
             u.display_name, u.band
      FROM mentor_session_applicants app
      JOIN users u ON u.id = app.student_id
      WHERE app.mentor_session_id = ANY($1)
      ORDER BY app.created_at ASC
    `,
    [ids]
  );

  const bySession = new Map(sessions.map((session) => [session.id, []]));
  for (const row of applicantsResult.rows) {
    bySession.get(row.mentor_session_id)?.push({
      studentId: row.student_id,
      displayName: row.display_name,
      band: row.band === null ? null : Number(row.band),
      status: row.status,
      appliedAt: toIsoString(row.created_at),
    });
  }

  return {
    mentorSessions: sessions.map((session) => ({
      ...session,
      applicants: bySession.get(session.id) || [],
    })),
  };
}

// --- Student applies to the queue ---------------------------------------
export async function applyToMentorSession({ mentorSessionId, studentId }) {
  if (!isNonEmptyString(mentorSessionId)) {
    throw new Error('mentorSessionId is required');
  }
  if (!isNonEmptyString(studentId)) {
    throw new Error('studentId is required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      'SELECT * FROM mentor_sessions WHERE id = $1 FOR UPDATE',
      [mentorSessionId]
    );
    const session = sessionResult.rows[0];
    if (!session) {
      throw new Error('Mentor session not found');
    }
    if (session.status !== 'open') {
      throw new Error('Phiên không còn nhận đăng ký');
    }
    if (session.mentor_id === studentId) {
      throw new Error('Mentor không thể tự apply');
    }

    const student = await getUser(client, studentId);
    if (!student) {
      throw new Error('Student not found');
    }
    if (student.user_role !== 'student') {
      throw new Error('Chỉ học viên mới được apply vào phiên mentor');
    }
    if (!isBandWithinTarget(student.band, session)) {
      throw new Error('Band hiện tại của bạn không nằm trong khoảng band mục tiêu của phiên này');
    }

    await client.query(
      `
        INSERT INTO mentor_session_applicants (mentor_session_id, student_id, status)
        VALUES ($1, $2, 'waiting')
        ON CONFLICT (mentor_session_id, student_id) DO NOTHING
      `,
      [mentorSessionId, studentId]
    );

    await createNotification(client, {
      recipientId: session.mentor_id,
      actorId: studentId,
      type: 'mentor_session_applied',
      title: 'Có học viên vào hàng chờ',
      body: `${student.display_name} vừa apply vào phiên ${focusLabel(session.focus)} của bạn`,
      entityType: 'mentor_session',
      entityId: mentorSessionId,
    });

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS c FROM mentor_session_applicants
       WHERE mentor_session_id = $1 AND status = 'waiting'`,
      [mentorSessionId]
    );

    await client.query('COMMIT');
    return { applied: true, applicantCount: countResult.rows[0].c };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- Student leaves the queue -------------------------------------------
export async function leaveMentorSession({ mentorSessionId, studentId }) {
  if (!isNonEmptyString(mentorSessionId)) {
    throw new Error('mentorSessionId is required');
  }
  if (!isNonEmptyString(studentId)) {
    throw new Error('studentId is required');
  }

  const result = await pool.query(
    `
      DELETE FROM mentor_session_applicants
      WHERE mentor_session_id = $1 AND student_id = $2 AND status = 'waiting'
    `,
    [mentorSessionId, studentId]
  );

  return { left: result.rowCount > 0 };
}

// --- Mentor picks a student and starts the session ----------------------
export async function chooseApplicantAndStart({ mentorSessionId, mentorId, studentId }) {
  if (!isNonEmptyString(mentorSessionId)) {
    throw new Error('mentorSessionId is required');
  }
  if (!isNonEmptyString(mentorId)) {
    throw new Error('mentorId is required');
  }
  if (!isNonEmptyString(studentId)) {
    throw new Error('studentId is required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      'SELECT * FROM mentor_sessions WHERE id = $1 FOR UPDATE',
      [mentorSessionId]
    );
    const mentorSession = sessionResult.rows[0];
    if (!mentorSession) {
      throw new Error('Mentor session not found');
    }
    if (mentorSession.mentor_id !== mentorId) {
      throw new Error('Chỉ mentor mở phiên mới được chọn học viên');
    }
    if (mentorSession.status !== 'open') {
      throw new Error('Phiên đã bắt đầu hoặc đã đóng');
    }

    const applicantResult = await client.query(
      `SELECT student_id FROM mentor_session_applicants
       WHERE mentor_session_id = $1 AND student_id = $2 AND status = 'waiting'`,
      [mentorSessionId, studentId]
    );
    if (applicantResult.rowCount === 0) {
      throw new Error('Học viên không có trong hàng chờ');
    }

    const { sessionId, roomId, topic } = await insertMentorSessionWithClient(client, {
      mentorId,
      studentId,
      topicId: mentorSession.topic_id,
      focus: mentorSession.focus,
    });

    await client.query(
      `
        UPDATE mentor_sessions
        SET status = 'started', session_id = $2, chosen_student_id = $3, started_at = NOW()
        WHERE id = $1
      `,
      [mentorSessionId, sessionId, studentId]
    );

    await client.query(
      `UPDATE mentor_session_applicants
       SET status = CASE WHEN student_id = $2 THEN 'chosen' ELSE 'passed' END
       WHERE mentor_session_id = $1`,
      [mentorSessionId, studentId]
    );

    // Notify every applicant: the chosen one to join, the rest that it started.
    const applicants = await client.query(
      'SELECT student_id, status FROM mentor_session_applicants WHERE mentor_session_id = $1',
      [mentorSessionId]
    );
    for (const applicant of applicants.rows) {
      const chosen = applicant.student_id === studentId;
      await createNotification(client, {
        recipientId: applicant.student_id,
        actorId: mentorId,
        type: chosen ? 'mentor_session_chosen' : 'mentor_session_not_chosen',
        title: chosen ? 'Bạn đã được chọn vào phiên học' : 'Phiên học đã bắt đầu',
        body: chosen
          ? `Mentor đã chọn bạn vào phiên ${focusLabel(mentorSession.focus)}. Hãy vào ngay.`
          : `Mentor đã chọn học viên khác cho phiên ${focusLabel(mentorSession.focus)}`,
        entityType: chosen ? 'session' : 'mentor_session',
        entityId: chosen ? sessionId : mentorSessionId,
      });
    }

    await client.query('COMMIT');
    return {
      started: true,
      mentorSessionId,
      sessionId,
      roomId,
      topic,
      chosenStudentId: studentId,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- Mentor closes an open session without starting ---------------------
export async function closeMentorSession({ mentorSessionId, mentorId }) {
  if (!isNonEmptyString(mentorSessionId)) {
    throw new Error('mentorSessionId is required');
  }
  if (!isNonEmptyString(mentorId)) {
    throw new Error('mentorId is required');
  }

  const result = await pool.query(
    `
      UPDATE mentor_sessions
      SET status = 'closed', closed_at = NOW()
      WHERE id = $1 AND mentor_id = $2 AND status = 'open'
      RETURNING id
    `,
    [mentorSessionId, mentorId]
  );

  if (result.rowCount === 0) {
    throw new Error('Không thể đóng phiên này');
  }

  return { closed: true };
}
