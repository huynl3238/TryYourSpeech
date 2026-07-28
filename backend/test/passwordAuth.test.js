import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';

// Signing a session needs a key; the value is irrelevant to these assertions.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret';

import {
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyEmailWithToken,
} from '../src/models/passwordAuthModel.js';

// Nothing is actually mailed during tests: RESEND_API_KEY is absent, the send
// fails, and the model swallows it — the same path a provider outage takes. The
// token is read straight from the database instead, standing in for the click.
//
// Unlike the other suites this one does NOT re-run schema.sql. Test files run in
// parallel, and its ALTER TABLE statements take an exclusive lock that deadlocks
// against whatever another file is doing. Migrating is the runner's job here
// (npm run db:migrate); the check below just skips if that has not happened.
async function canUseDatabase() {
  try {
    await pool.query('SELECT password_hash, verified_at FROM user_identities LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

// Tokens are stored hashed, so a test cannot read one back out. It writes its
// own instead — the same shape the model would have created.
async function issueToken(email, purpose) {
  const user = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
  const token = randomUUID();

  await pool.query(
    `
      INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 day')
    `,
    [randomUUID(), user.rows[0].id, purpose, createHash('sha256').update(token).digest('hex')]
  );

  return token;
}

async function cleanupEmail(email) {
  await pool.query('DELETE FROM users WHERE LOWER(email) = $1', [email]);
}

test('password sign-up requires verifying the email before signing in', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const email = `verify-${randomUUID()}@example.com`;

  try {
    await registerWithPassword({
      email,
      password: 'mot-mat-khau-du-dai',
      displayName: 'Nguoi Dung Test',
    });

    const beforeVerify = await loginWithPassword({ email, password: 'mot-mat-khau-du-dai' });
    assert.equal(beforeVerify.status, 403);
    assert.equal(beforeVerify.needsVerification, true);

    const session = await verifyEmailWithToken(await issueToken(email, 'verify_email'));
    assert.equal(session.user.email, email);
    assert.equal(session.user.userRole, 'student');
    assert.ok(session.accessToken);

    const afterVerify = await loginWithPassword({ email, password: 'mot-mat-khau-du-dai' });
    assert.equal(afterVerify.error, undefined);
    assert.equal(afterVerify.session.user.email, email);

    const wrongPassword = await loginWithPassword({ email, password: 'sai-mat-khau-roi' });
    assert.equal(wrongPassword.status, 401);
  } finally {
    await cleanupEmail(email);
  }
});

// The attack this blocks: registering over somebody else's account to overwrite
// their password.
test('registering again over a verified account does not change its password', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const email = `takeover-${randomUUID()}@example.com`;

  try {
    await registerWithPassword({ email, password: 'mat-khau-that-cua-toi', displayName: 'Chu So Huu' });
    await verifyEmailWithToken(await issueToken(email, 'verify_email'));

    await registerWithPassword({ email, password: 'mat-khau-ke-tan-cong', displayName: 'Ke Tan Cong' });

    const asAttacker = await loginWithPassword({ email, password: 'mat-khau-ke-tan-cong' });
    assert.equal(asAttacker.status, 401);

    const asOwner = await loginWithPassword({ email, password: 'mat-khau-that-cua-toi' });
    assert.equal(asOwner.session.user.displayName, 'Chu So Huu');
  } finally {
    await cleanupEmail(email);
  }
});

// A Google account already proves the address, but that must not be enough to
// attach a password to it.
test('a password added to an existing Google account stays unusable until verified', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const email = `google-${randomUUID()}@example.com`;
  const userId = randomUUID();

  try {
    await pool.query(
      "INSERT INTO users (id, display_name, email, user_role) VALUES ($1, 'Chu Tai Khoan Google', $2, 'student')",
      [userId, email]
    );
    await pool.query(
      `
        INSERT INTO user_identities (id, user_id, provider, provider_user_id, email, verified_at)
        VALUES ($1, $2, 'google', $3, $4, NOW())
      `,
      [randomUUID(), userId, `google-sub-${userId}`, email]
    );

    await registerWithPassword({ email, password: 'mat-khau-ke-la-dat', displayName: 'Ke La' });

    const accounts = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE LOWER(email) = $1', [email]);
    assert.equal(accounts.rows[0].count, 1, 'phải gộp vào tài khoản sẵn có, không tạo tài khoản thứ hai');

    const attempt = await loginWithPassword({ email, password: 'mat-khau-ke-la-dat' });
    assert.equal(attempt.status, 403);
    assert.equal(attempt.needsVerification, true);

    const identities = await pool.query(
      "SELECT provider, verified_at FROM user_identities WHERE user_id = $1 ORDER BY provider",
      [userId]
    );
    assert.deepEqual(identities.rows.map((row) => row.provider), ['google', 'password']);
    assert.ok(identities.rows[0].verified_at, 'danh tính Google vẫn đã xác minh');
    assert.equal(identities.rows[1].verified_at, null, 'danh tính mật khẩu chưa xác minh');
  } finally {
    await cleanupEmail(email);
  }
});

test('resetting the password revokes existing sessions and retires the link', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const email = `reset-${randomUUID()}@example.com`;

  try {
    await registerWithPassword({ email, password: 'mat-khau-ban-dau', displayName: 'Nguoi Quen' });
    await verifyEmailWithToken(await issueToken(email, 'verify_email'));

    const signedIn = await loginWithPassword({ email, password: 'mat-khau-ban-dau' });
    const userId = signedIn.session.user.id;

    await requestPasswordReset(email);
    const token = await issueToken(email, 'reset_password');

    const result = await resetPasswordWithToken({ token, password: 'mat-khau-hoan-toan-moi' });
    assert.equal(result.user.id, userId);

    const liveTokens = await pool.query(
      'SELECT COUNT(*)::int AS count FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
    assert.equal(liveTokens.rows[0].count, 0, 'mọi phiên cũ phải bị thu hồi');

    assert.equal(await resetPasswordWithToken({ token, password: 'thu-dung-lai-link' }), null);

    const oldPassword = await loginWithPassword({ email, password: 'mat-khau-ban-dau' });
    assert.equal(oldPassword.status, 401);

    const newPassword = await loginWithPassword({ email, password: 'mat-khau-hoan-toan-moi' });
    assert.equal(newPassword.error, undefined);
  } finally {
    await cleanupEmail(email);
  }
});

test('sign-up input is validated before anything is written', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  await assert.rejects(
    registerWithPassword({ email: 'khong-phai-email', password: 'mot-mat-khau-du-dai', displayName: 'A' }),
    /Địa chỉ email không hợp lệ/
  );

  await assert.rejects(
    registerWithPassword({ email: 'ai-do@example.com', password: 'ngan', displayName: 'A' }),
    /Mật khẩu phải có ít nhất/
  );

  await assert.rejects(
    registerWithPassword({ email: 'ai-do@example.com', password: 'mot-mat-khau-du-dai', displayName: '   ' }),
    /Tên hiển thị không hợp lệ/
  );
});
