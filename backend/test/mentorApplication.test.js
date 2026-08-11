import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';

// Signing a token needs a key before app.js reads the config.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret';

const { default: app } = await import('../src/app.js');
const { signAccessToken } = await import('../src/models/authModel.js');

import {
  getLatestMentorApplication,
  listMentorApplications,
  listMentors,
  revokeMentorRole,
  reviewMentorApplication,
  submitMentorApplication,
} from '../src/models/mentorApplicationModel.js';

// Like passwordAuth.test.js, this file does not re-run schema.sql — migrating is
// the runner's job (npm run db:migrate) and re-running it here would take locks
// other suites are waiting on.
async function canUseDatabase() {
  try {
    await pool.query('SELECT id FROM mentor_applications LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

async function createUser(role) {
  const result = await pool.query(
    `
      INSERT INTO users (id, display_name, band, user_role)
      VALUES (gen_random_uuid(), $1, 6.5, $2)
      RETURNING id
    `,
    [`Test ${randomUUID().slice(0, 8)}`, role]
  );

  return result.rows[0].id;
}

async function getRole(userId) {
  const result = await pool.query('SELECT user_role FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.user_role || null;
}

async function cleanup(userIds) {
  for (const userId of userIds.filter(Boolean)) {
    await pool.query('DELETE FROM notifications WHERE recipient_id = $1 OR actor_id = $1', [userId]);
    await pool.query('DELETE FROM mentor_applications WHERE user_id = $1 OR reviewed_by = $1', [
      userId,
    ]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }
}

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

// Signed-in requests go through the Bearer branch of the auth middleware, which
// exists precisely so tests and scripts do not need browser cookies.
async function callAs(baseUrl, userId, role, method, path, body) {
  return await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${signAccessToken({ id: userId, userRole: role })}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Anonymous callers are covered by routes.test.js. What matters here is the
// stronger claim: being signed in is not enough — granting the role is admin-only.
test('a signed-in student cannot reach the admin side of the mentor flow', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const server = await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let student = null;
  let mentor = null;
  let admin = null;

  try {
    student = await createUser('student');
    mentor = await createUser('mentor');
    admin = await createUser('admin');
    const application = await submitMentorApplication({ userId: student, message: 'Cho mình xin.' });

    const adminOnly = [
      ['GET', '/api/admin/mentor-applications'],
      ['POST', `/api/admin/mentor-applications/${application.application.id}/review`, {
        decision: 'approved',
      }],
      ['GET', '/api/admin/mentors'],
      ['POST', `/api/admin/mentors/${mentor}/revoke`, {}],
    ];

    const failures = [];
    for (const [method, path, body] of adminOnly) {
      // Both a student and a mentor must be turned away: a mentor promoting
      // other mentors would make the whole approval step pointless.
      for (const [callerId, callerRole] of [[student, 'student'], [mentor, 'mentor']]) {
        const response = await callAs(baseUrl, callerId, callerRole, method, path, body);
        if (response.status !== 403) {
          failures.push(`${callerRole} ${method} ${path} -> ${response.status}`);
        }
      }
    }

    assert.deepEqual(failures, []);

    // The role really is the deciding factor, not the route being broken.
    const asAdmin = await callAs(baseUrl, admin, 'admin', 'GET', '/api/admin/mentor-applications');
    assert.equal(asAdmin.status, 200);

    // And an admin cannot strip their own role, which would lock the app out of
    // its own admin tools.
    const selfRevoke = await callAs(
      baseUrl,
      admin,
      'admin',
      'POST',
      `/api/admin/mentors/${admin}/revoke`,
      {}
    );
    assert.equal(selfRevoke.status, 400);
    assert.equal(await getRole(admin), 'admin');
  } finally {
    server.close();
    await cleanup([student, mentor, admin]);
  }
});

test('approving an application grants the mentor role and tells the applicant', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let student = null;
  let admin = null;

  try {
    student = await createUser('student');
    admin = await createUser('admin');

    const submitted = await submitMentorApplication({
      userId: student,
      message: 'Mình đã dạy IELTS 2 năm.',
    });
    assert.equal(submitted.application.status, 'pending');
    assert.equal(await getRole(student), 'student', 'nộp đơn chưa được cấp quyền ngay');

    // The admin queue must actually surface it, otherwise nobody can act on it.
    const queue = await listMentorApplications({ status: 'pending' });
    assert.ok(queue.applications.some((application) => application.userId === student));

    const reviewed = await reviewMentorApplication({
      applicationId: submitted.application.id,
      reviewerId: admin,
      decision: 'approved',
    });

    assert.equal(reviewed.application.status, 'approved');
    assert.equal(await getRole(student), 'mentor');

    const notified = await pool.query(
      'SELECT type FROM notifications WHERE recipient_id = $1',
      [student]
    );
    assert.equal(notified.rows[0]?.type, 'mentor_application_approved');

    const mentors = await listMentors();
    assert.ok(mentors.mentors.some((mentor) => mentor.id === student));
  } finally {
    await cleanup([student, admin]);
  }
});

test('rejecting keeps the applicant a student and passes the reason back', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let student = null;
  let admin = null;

  try {
    student = await createUser('student');
    admin = await createUser('admin');

    const submitted = await submitMentorApplication({ userId: student, message: 'Cho mình thử.' });
    await reviewMentorApplication({
      applicationId: submitted.application.id,
      reviewerId: admin,
      decision: 'rejected',
      reviewNote: 'Cần thêm kinh nghiệm giảng dạy.',
    });

    assert.equal(await getRole(student), 'student');

    // The applicant sees the reason on their own profile, so it has to come back
    // from their own lookup, not only from the admin list.
    const mine = await getLatestMentorApplication(student);
    assert.equal(mine.application.status, 'rejected');
    assert.equal(mine.application.reviewNote, 'Cần thêm kinh nghiệm giảng dạy.');

    // Rejected is not a dead end: the partial unique index only blocks a second
    // *pending* application, so they can try again.
    const again = await submitMentorApplication({ userId: student, message: 'Mình đã bổ sung.' });
    assert.equal(again.application.status, 'pending');
  } finally {
    await cleanup([student, admin]);
  }
});

test('an application cannot be submitted twice or reviewed twice', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let student = null;
  let admin = null;
  let mentor = null;

  try {
    student = await createUser('student');
    admin = await createUser('admin');
    mentor = await createUser('mentor');

    const submitted = await submitMentorApplication({ userId: student, message: 'Đơn đầu tiên.' });

    await assert.rejects(
      () => submitMentorApplication({ userId: student, message: 'Đơn thứ hai.' }),
      /đang chờ duyệt/
    );

    // Someone who already holds the role has nothing to apply for.
    await assert.rejects(
      () => submitMentorApplication({ userId: mentor, message: 'Mình muốn làm mentor.' }),
      /đã có quyền mentor/
    );

    await reviewMentorApplication({
      applicationId: submitted.application.id,
      reviewerId: admin,
      decision: 'approved',
    });

    // Two admins opening the queue at once must not both be able to act.
    await assert.rejects(
      () =>
        reviewMentorApplication({
          applicationId: submitted.application.id,
          reviewerId: admin,
          decision: 'rejected',
        }),
      /đã được xử lý rồi/
    );
  } finally {
    await cleanup([student, admin, mentor]);
  }
});

test('revoking demotes a mentor but never touches an admin', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let mentor = null;
  let admin = null;
  let otherAdmin = null;

  try {
    mentor = await createUser('mentor');
    admin = await createUser('admin');
    otherAdmin = await createUser('admin');

    const result = await revokeMentorRole({ userId: mentor, adminId: admin, reason: 'Ngừng hợp tác' });
    assert.equal(result.userRole, 'student');
    assert.equal(await getRole(mentor), 'student');

    // The admin types the reason into the confirmation box, and this is where it
    // has to end up — otherwise the demoted mentor is only told the default line.
    const notified = await pool.query(
      `
        SELECT type, body
        FROM notifications
        WHERE recipient_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [mentor]
    );
    assert.equal(notified.rows[0].type, 'mentor_role_revoked');
    assert.equal(notified.rows[0].body, 'Ngừng hợp tác');

    // Revoking again is not a silent no-op — the caller is told nothing happened.
    await assert.rejects(
      () => revokeMentorRole({ userId: mentor, adminId: admin }),
      /không phải mentor/
    );

    // The role guard is on 'mentor', so an admin cannot be stripped this way.
    await assert.rejects(
      () => revokeMentorRole({ userId: otherAdmin, adminId: admin }),
      /không phải mentor/
    );
    assert.equal(await getRole(otherAdmin), 'admin');
  } finally {
    await cleanup([mentor, admin, otherAdmin]);
  }
});
