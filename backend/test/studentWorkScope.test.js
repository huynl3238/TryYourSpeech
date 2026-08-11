import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';

// Signing a token needs a key before app.js reads the config.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret';

const { default: app } = await import('../src/app.js');
const { signAccessToken } = await import('../src/models/authModel.js');
const { createMatchedSession } = await import('../src/models/sessionModel.js');
const { listStudentWork } = await import('../src/models/studentWorkModel.js');

// Like mentorApplication.test.js, this file does not re-run schema.sql —
// migrating is the runner's job (npm run db:migrate && npm run db:seed).
// It also needs seeded questions, since createMatchedSession picks a topic.
async function canUseDatabase() {
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM questions');
    return result.rows[0].count > 0;
  } catch {
    return false;
  }
}

async function createUser(role, band) {
  const result = await pool.query(
    `
      INSERT INTO users (id, display_name, band, user_role)
      VALUES (gen_random_uuid(), $1, $2, $3)
      RETURNING id
    `,
    [`Scope ${randomUUID().slice(0, 8)}`, band, role]
  );

  return result.rows[0].id;
}

async function cleanup(sessionIds, userIds) {
  for (const sessionId of sessionIds.filter(Boolean)) {
    await pool.query(
      `
        DELETE FROM peer_notes
        WHERE turn_id IN (SELECT id FROM turns WHERE session_id = $1)
      `,
      [sessionId]
    );
    await pool.query(
      `
        DELETE FROM ai_results
        WHERE turn_id IN (SELECT id FROM turns WHERE session_id = $1)
      `,
      [sessionId]
    );
    await pool.query('DELETE FROM session_ai_results WHERE session_id = $1', [sessionId]);
    await pool.query('DELETE FROM turns WHERE session_id = $1', [sessionId]);
    await pool.query('DELETE FROM mentor_reviews WHERE session_id = $1', [sessionId]);
    await pool.query('DELETE FROM classroom_posts WHERE session_id = $1', [sessionId]);
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }

  for (const userId of userIds.filter(Boolean)) {
    await pool.query('DELETE FROM notifications WHERE recipient_id = $1 OR actor_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }
}

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function callAs(baseUrl, userId, role, method, path) {
  return await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${signAccessToken({ id: userId, userRole: role })}`,
    },
  });
}

// Builds the three sessions the scoping rule has to tell apart: one mentor
// session per mentor, plus a peer session between two learners that neither
// mentor took part in.
async function buildFixture() {
  const mentorOne = await createUser('mentor', null);
  const mentorTwo = await createUser('mentor', null);
  const studentOne = await createUser('student', 6.5);
  const studentTwo = await createUser('student', 6);
  const studentThree = await createUser('student', 6);

  const mentorSessionOne = await createMatchedSession(
    `scope-mentor-one-${randomUUID().slice(0, 8)}`,
    { userId: studentOne, band: 6.5 },
    { userId: mentorOne, band: null },
    'mentor'
  );
  const mentorSessionTwo = await createMatchedSession(
    `scope-mentor-two-${randomUUID().slice(0, 8)}`,
    { userId: studentTwo, band: 6 },
    { userId: mentorTwo, band: null },
    'mentor'
  );
  const peerSession = await createMatchedSession(
    `scope-peer-${randomUUID().slice(0, 8)}`,
    { userId: studentTwo, band: 6 },
    { userId: studentThree, band: 6 },
    'peer'
  );

  return {
    users: [mentorOne, mentorTwo, studentOne, studentTwo, studentThree],
    sessions: [mentorSessionOne.sessionId, mentorSessionTwo.sessionId, peerSession.sessionId],
    mentorOne,
    mentorTwo,
    mentorSessionOne: mentorSessionOne.sessionId,
    mentorSessionTwo: mentorSessionTwo.sessionId,
    peerSession: peerSession.sessionId,
  };
}

// The claim under test: "Bài học viên" lists the mentor's own sessions and
// nothing else. Before the scoping fix a mentor saw every session in the
// system, including peer practice between two learners they never met.
test('a mentor only sees the sessions they ran in student work', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate và db:seed');
    return;
  }

  const server = await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let fixture = null;

  try {
    fixture = await buildFixture();

    const response = await callAs(
      baseUrl,
      fixture.mentorOne,
      'mentor',
      'GET',
      '/api/teacher/student-work?limit=100'
    );
    assert.equal(response.status, 200);

    const body = await response.json();
    const listedIds = body.sessions.map((item) => item.id);

    assert.ok(listedIds.includes(fixture.mentorSessionOne), 'phiên của chính mentor phải hiện');
    assert.ok(!listedIds.includes(fixture.mentorSessionTwo), 'phiên của mentor khác không được hiện');
    assert.ok(!listedIds.includes(fixture.peerSession), 'phiên peer của học viên khác không được hiện');
  } finally {
    server.close();
    await cleanup(fixture?.sessions || [], fixture?.users || []);
  }
});

// Each mentor sees a different list — proves the filter reads the caller's id
// rather than, say, always returning mentor sessions in general.
test('each mentor gets their own list', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate và db:seed');
    return;
  }

  const server = await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let fixture = null;

  try {
    fixture = await buildFixture();

    const secondResponse = await callAs(
      baseUrl,
      fixture.mentorTwo,
      'mentor',
      'GET',
      '/api/teacher/student-work?limit=100'
    );
    const secondBody = await secondResponse.json();
    const secondIds = secondBody.sessions.map((item) => item.id);

    assert.ok(secondIds.includes(fixture.mentorSessionTwo));
    assert.ok(!secondIds.includes(fixture.mentorSessionOne));
    assert.ok(!secondIds.includes(fixture.peerSession));
  } finally {
    server.close();
    await cleanup(fixture?.sessions || [], fixture?.users || []);
  }
});

// An admin oversees the whole system, so the scoping must not apply to them.
test('an admin still sees every session, peer sessions included', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate và db:seed');
    return;
  }

  const server = await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let fixture = null;
  let admin = null;

  try {
    fixture = await buildFixture();
    admin = await createUser('admin', null);

    const response = await callAs(
      baseUrl,
      admin,
      'admin',
      'GET',
      '/api/teacher/student-work?limit=100'
    );
    const body = await response.json();
    const listedIds = body.sessions.map((item) => item.id);

    assert.ok(listedIds.includes(fixture.mentorSessionOne));
    assert.ok(listedIds.includes(fixture.mentorSessionTwo));
    assert.ok(listedIds.includes(fixture.peerSession));
  } finally {
    server.close();
    await cleanup(fixture?.sessions || [], [...(fixture?.users || []), admin]);
  }
});

// The list only hides other people's sessions; opening one was already refused
// by the session endpoint. Both layers are asserted so neither can quietly
// become the only thing standing between a mentor and a stranger's recording.
test('opening a peer session a mentor did not take part in is still refused', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate và db:seed');
    return;
  }

  const server = await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let fixture = null;

  try {
    fixture = await buildFixture();

    const detail = await callAs(
      baseUrl,
      fixture.mentorOne,
      'mentor',
      'GET',
      `/api/sessions/${fixture.peerSession}`
    );
    assert.equal(detail.status, 403);

    const results = await callAs(
      baseUrl,
      fixture.mentorOne,
      'mentor',
      'GET',
      `/api/results/${fixture.peerSession}?userId=${fixture.mentorTwo}`
    );
    // The results endpoint reads the caller's own id and ignores the ?userId=
    // the page sends, so asking for someone else's results is refused outright.
    assert.equal(results.status, 400);
    const resultsBody = await results.json();
    assert.match(resultsBody.error, /not in this session/);
  } finally {
    server.close();
    await cleanup(fixture?.sessions || [], fixture?.users || []);
  }
});

test('listStudentWork rejects a mentorId that is not a string', async () => {
  await assert.rejects(
    () => listStudentWork({ mentorId: 42 }),
    /mentorId is invalid/
  );
  await assert.rejects(
    () => listStudentWork({ mentorId: '   ' }),
    /mentorId is invalid/
  );
});
