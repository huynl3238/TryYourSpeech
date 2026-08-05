import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
import { createMatchedSession } from '../src/models/sessionModel.js';
import { getTurnAudioAccess } from '../src/models/audioModel.js';

// These recordings are people's voices, so the rule deciding who may hear one is
// worth testing on a real database rather than a stub: the answer comes out of a
// single SQL query joining sessions and classroom_posts, and a stub would only be
// re-testing the JavaScript around it.
async function canUseDatabase() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function createUser(displayName, band, userRole = 'student') {
  const result = await pool.query(
    `
      INSERT INTO users (id, display_name, band, user_role)
      VALUES (gen_random_uuid(), $1, $2, $3)
      RETURNING id, user_role
    `,
    [displayName, band, userRole]
  );

  return { id: result.rows[0].id, userRole: result.rows[0].user_role };
}

async function setUp() {
  const session = await createMatchedSession(
    `audio-access-${randomUUID().slice(0, 8)}`,
    { userId: (await createUser('Audio A', 6.5)).id, band: 6.5 },
    { userId: (await createUser('Audio B', 6)).id, band: 6 }
  );

  const turns = await pool.query(
    `
      UPDATE turns
      SET upload_status = 'uploaded', audio_url = '/uploads/audio/' || id || '.webm'
      WHERE session_id = $1
      RETURNING id, speaker_id
    `,
    [session.sessionId]
  );

  return { session, turn: turns.rows[0] };
}

async function cleanUp(context, extraUserIds = []) {
  if (!context) return;

  const { session } = context;
  await pool.query('DELETE FROM classroom_posts WHERE session_id = $1', [session.sessionId]);
  await pool.query('DELETE FROM turns WHERE session_id = $1', [session.sessionId]);
  await pool.query('DELETE FROM sessions WHERE id = $1', [session.sessionId]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [
    [session.userA.id, session.userB.id, ...extraUserIds],
  ]);
}

async function publishPost(context, status) {
  await pool.query(
    `
      INSERT INTO classroom_posts (id, session_id, author_id, title, status)
      VALUES ($1, $2, $3, 'Bài đăng thử', $4)
    `,
    [randomUUID(), context.session.sessionId, context.session.userA.id, status]
  );
}

test('both people in the session may hear the recording, a stranger may not', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let context = null;
  let stranger = null;

  try {
    context = await setUp();
    stranger = await createUser('Audio Stranger', 6);

    const speaker = await getTurnAudioAccess(context.turn.id, { id: context.session.userA.id });
    const listener = await getTurnAudioAccess(context.turn.id, { id: context.session.userB.id });
    const outsider = await getTurnAudioAccess(context.turn.id, { id: stranger.id });

    // The speaker's own turn and their partner's turn are both reachable: review
    // and results replay the whole session, not one side of it.
    assert.equal(speaker.allowed, true);
    assert.equal(listener.allowed, true);
    assert.equal(outsider.allowed, false);

    // A refusal must not hand back the path either — the caller returns 404 on
    // either field being missing, and this keeps that from depending on luck.
    assert.equal(outsider.audioUrl, null);
  } finally {
    await cleanUp(context, stranger ? [stranger.id] : []);
  }
});

test('a classroom post only opens the recording up once it is published', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let context = null;
  let stranger = null;

  try {
    context = await setUp();
    stranger = await createUser('Audio Classmate', 6);

    // Waiting on the partner's consent is not consent.
    await publishPost(context, 'pending');
    assert.equal((await getTurnAudioAccess(context.turn.id, { id: stranger.id })).allowed, false);

    await pool.query('UPDATE classroom_posts SET status = $1 WHERE session_id = $2', [
      'published',
      context.session.sessionId,
    ]);
    assert.equal((await getTurnAudioAccess(context.turn.id, { id: stranger.id })).allowed, true);

    // Hiding a post has to take the audio back with it. It did not before this
    // check existed: the file stayed downloadable at its /uploads URL.
    await pool.query('UPDATE classroom_posts SET status = $1 WHERE session_id = $2', [
      'hidden',
      context.session.sessionId,
    ]);
    assert.equal((await getTurnAudioAccess(context.turn.id, { id: stranger.id })).allowed, false);
  } finally {
    await cleanUp(context, stranger ? [stranger.id] : []);
  }
});

test('an admin may hear any recording, a signed-out visitor may not', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let context = null;
  let admin = null;

  try {
    context = await setUp();
    admin = await createUser('Audio Admin', 7, 'admin');

    const asAdmin = await getTurnAudioAccess(context.turn.id, { id: admin.id, userRole: 'admin' });
    assert.equal(asAdmin.allowed, true);

    assert.equal((await getTurnAudioAccess(context.turn.id, null)).allowed, false);
    assert.equal((await getTurnAudioAccess(context.turn.id, {})).allowed, false);
  } finally {
    await cleanUp(context, admin ? [admin.id] : []);
  }
});

test('a turn with nothing uploaded yet is refused instead of pointing at a missing file', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let context = null;

  try {
    context = await setUp();
    await pool.query('UPDATE turns SET audio_url = NULL WHERE id = $1', [context.turn.id]);

    const own = await getTurnAudioAccess(context.turn.id, { id: context.session.userA.id });
    assert.equal(own.allowed, false);
    assert.equal(own.audioUrl, null);

    // An id that was never a turn answers exactly like one that has no audio, so
    // the route can return the same 404 for both without a second branch.
    const missing = await getTurnAudioAccess(randomUUID(), { id: context.session.userA.id });
    assert.equal(missing.allowed, false);
  } finally {
    await cleanUp(context);
  }
});
