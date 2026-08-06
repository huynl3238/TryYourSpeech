import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
import { getAdminStats } from '../src/models/adminStatsModel.js';

// These two numbers go into the report, so what they mean has to be pinned down:
// the completion rate is over sessions that already ended, and the average
// duration is over completed ones only. Both used to be computed over every row.
//
// The dashboard counts the whole table, and the table is never empty — seed data
// and other test files both leave rows behind. So rather than assert absolute
// numbers against a fixture, each test measures what a new row DOES to the
// figure. That is also the sharper question: the bug was never a wrong total, it
// was rows moving a number they had no business moving.
async function canUseDatabase() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function createUser(displayName) {
  const result = await pool.query(
    `
      INSERT INTO users (id, display_name, band, user_role)
      VALUES (gen_random_uuid(), $1, 6, 'student')
      RETURNING id
    `,
    [displayName]
  );

  return result.rows[0].id;
}

// Written straight into the table rather than driven through the socket layer:
// the point is the arithmetic over known rows, and matchmaking would only make
// the fixture harder to read without making it more truthful.
async function createSession({ userA, userB, status, startedAt = null, endedAt = null }) {
  const id = randomUUID();
  await pool.query(
    `
      INSERT INTO sessions (id, room_id, user_a_id, user_b_id, status, started_at, ended_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [id, `admin-stats-${id.slice(0, 8)}`, userA, userB, status, startedAt, endedAt]
  );
}

async function cleanUp(userIds) {
  await pool.query("DELETE FROM sessions WHERE room_id LIKE 'admin-stats-%'");
  if (userIds.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  }
}

test('phiên đang luyện dở không kéo tỉ lệ hoàn thành xuống', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const userIds = [];

  try {
    const userA = await createUser('Stats A');
    const userB = await createUser('Stats B');
    userIds.push(userA, userB);

    // One finished session so the ratio is defined no matter what the table
    // already held.
    await createSession({ userA, userB, status: 'completed' });
    const before = await getAdminStats();

    // Four sessions that have not landed yet. Nobody has failed anything; the
    // rate must not budge. Before the fix each of these lowered it.
    await createSession({ userA, userB, status: 'matched' });
    await createSession({ userA, userB, status: 'active' });
    await createSession({ userA, userB, status: 'reviewing' });
    await createSession({ userA, userB, status: 'processing' });

    const after = await getAdminStats();
    assert.equal(after.overview.completionRate, before.overview.completionRate);

    // ...and a session that really was abandoned still counts against it, so the
    // rate is not simply ignoring bad news.
    await createSession({ userA, userB, status: 'abandoned' });
    const withAbandoned = await getAdminStats();
    assert.equal(withAbandoned.overview.abandonedSessions, before.overview.abandonedSessions + 1);
    assert.ok(
      withAbandoned.overview.completionRate < after.overview.completionRate,
      'phiên bỏ giữa chừng phải làm tỉ lệ hoàn thành giảm'
    );
  } finally {
    await cleanUp(userIds);
  }
});

test('thời lượng trung bình không tính phiên bỏ giữa chừng', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const userIds = [];

  try {
    const userA = await createUser('Duration A');
    const userB = await createUser('Duration B');
    userIds.push(userA, userB);

    const startedAt = new Date('2026-01-01T10:00:00Z');
    await createSession({
      userA,
      userB,
      status: 'completed',
      startedAt,
      endedAt: new Date('2026-01-01T10:10:00Z'),
    });

    const before = await getAdminStats();
    assert.ok(before.overview.avgSessionSeconds > 0);

    // Someone who quit after thirty seconds did not have a thirty-second practice
    // session. Averaging them in describes nothing anyone would want to know, and
    // twenty of them would make the app look like people barely stay.
    for (let i = 0; i < 20; i += 1) {
      await createSession({
        userA,
        userB,
        status: 'abandoned',
        startedAt,
        endedAt: new Date('2026-01-01T10:00:30Z'),
      });
    }

    const after = await getAdminStats();
    assert.equal(after.overview.avgSessionSeconds, before.overview.avgSessionSeconds);
  } finally {
    await cleanUp(userIds);
  }
});
