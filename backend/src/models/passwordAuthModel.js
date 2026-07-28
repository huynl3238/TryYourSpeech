import { randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { hashToken, issueSessionForUser, mapAuthUser, revokeAllRefreshTokensForUser } from './authModel.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/emailSender.js';

const BCRYPT_ROUNDS = 12;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function validateEmail(email) {
  const normalized = normalizeEmail(email);

  if (!normalized || normalized.length > 255 || !EMAIL_PATTERN.test(normalized)) {
    throw new Error('Địa chỉ email không hợp lệ');
  }

  return normalized;
}

// Length is the property that actually matters; composition rules mostly push
// people toward "Password1!" and a sticky note.
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('Mật khẩu quá dài');
  }

  return password;
}

export function validateDisplayName(displayName) {
  const trimmed = typeof displayName === 'string' ? displayName.trim() : '';

  if (trimmed.length === 0 || trimmed.length > 100) {
    throw new Error('Tên hiển thị không hợp lệ');
  }

  return trimmed;
}

// A rejected address (typo, dead domain, provider outage) must not change what
// the caller sees: the endpoints answer "check your inbox" either way, so that
// the response cannot be used to probe which addresses are deliverable — or,
// worse, which ones exist here. Operators still see the failure in the logs.
async function deliver(send, context) {
  try {
    await send();
    return true;
  } catch (err) {
    console.error(`Failed to send ${context} email:`, err.message);
    return false;
  }
}

async function createEmailToken(client, { userId, purpose, ttlMs }) {
  const token = randomBytes(32).toString('base64url');

  // One live link per purpose: issuing a new one retires the old, so a link
  // forwarded or leaked earlier stops working.
  await client.query(
    `
      UPDATE email_tokens
      SET used_at = NOW()
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL
    `,
    [userId, purpose]
  );

  await client.query(
    `
      INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [randomUUID(), userId, purpose, hashToken(token), new Date(Date.now() + ttlMs)]
  );

  return token;
}

async function findPasswordIdentity(client, email) {
  const result = await client.query(
    `
      SELECT ui.id, ui.user_id, ui.password_hash, ui.verified_at, u.display_name, u.email
      FROM user_identities ui
      JOIN users u ON u.id = ui.user_id
      WHERE ui.provider = 'password' AND ui.provider_user_id = $1
    `,
    [email]
  );

  return result.rows[0] || null;
}

// Registration never says whether an address is already taken — that would turn
// this endpoint into a way to check who has an account here. The caller always
// answers "check your inbox"; what actually lands there depends on the state
// found below.
export async function registerWithPassword({ email, password, displayName }) {
  const safeEmail = validateEmail(email);
  const safePassword = validatePassword(password);
  const safeName = validateDisplayName(displayName);
  const passwordHash = await bcrypt.hash(safePassword, BCRYPT_ROUNDS);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingIdentity = await findPasswordIdentity(client, safeEmail);

    if (existingIdentity?.verified_at) {
      // Already a usable account. Say nothing new, and do not touch the
      // password — otherwise anyone could reset a stranger's login by
      // "registering" over it.
      await client.query('COMMIT');
      return { sent: false };
    }

    let userId = existingIdentity?.user_id || null;
    let recipientName = existingIdentity?.display_name || safeName;

    if (!userId) {
      const existingUser = await client.query(
        'SELECT id, display_name FROM users WHERE LOWER(email) = $1',
        [safeEmail]
      );

      if (existingUser.rows[0]) {
        // An account already exists for this address (signed up with Google).
        // Attaching a password identity is safe only because it stays
        // unverified until the real owner clicks the emailed link.
        userId = existingUser.rows[0].id;
        recipientName = existingUser.rows[0].display_name;
      } else {
        const created = await client.query(
          `
            INSERT INTO users (id, display_name, email, user_role)
            VALUES ($1, $2, $3, 'student')
            RETURNING id
          `,
          [randomUUID(), safeName, safeEmail]
        );
        userId = created.rows[0].id;
      }
    }

    if (existingIdentity) {
      await client.query(
        'UPDATE user_identities SET password_hash = $2 WHERE id = $1',
        [existingIdentity.id, passwordHash]
      );
    } else {
      await client.query(
        `
          INSERT INTO user_identities (id, user_id, provider, provider_user_id, email, password_hash)
          VALUES ($1, $2, 'password', $3, $3, $4)
        `,
        [randomUUID(), userId, safeEmail, passwordHash]
      );
    }

    const token = await createEmailToken(client, {
      userId,
      purpose: 'verify_email',
      ttlMs: VERIFY_TOKEN_TTL_MS,
    });

    await client.query('COMMIT');

    // Sent after COMMIT: a mail cannot be un-sent if the transaction rolls back.
    const sent = await deliver(
      () => sendVerificationEmail({ to: safeEmail, displayName: recipientName, token }),
      'verification'
    );

    return { sent };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function consumeEmailToken(client, { token, purpose }) {
  const result = await client.query(
    `
      SELECT id, user_id
      FROM email_tokens
      WHERE token_hash = $1
        AND purpose = $2
        AND used_at IS NULL
        AND expires_at > NOW()
      FOR UPDATE
    `,
    [hashToken(token), purpose]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  await client.query('UPDATE email_tokens SET used_at = NOW() WHERE id = $1', [row.id]);
  return row.user_id;
}

// Confirms the address and signs the person in, so they are not asked to type
// the password they just chose all over again.
export async function verifyEmailWithToken(token) {
  if (typeof token !== 'string' || token.trim().length === 0) {
    return null;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userId = await consumeEmailToken(client, { token: token.trim(), purpose: 'verify_email' });
    if (!userId) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `
        UPDATE user_identities
        SET verified_at = COALESCE(verified_at, NOW())
        WHERE user_id = $1 AND provider = 'password'
      `,
      [userId]
    );

    const updated = await client.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1 RETURNING *',
      [userId]
    );

    const session = await issueSessionForUser(client, updated.rows[0]);
    await client.query('COMMIT');

    return session;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function resendVerificationEmail(email) {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) {
    return { sent: false };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const identity = await findPasswordIdentity(client, safeEmail);
    if (!identity || identity.verified_at) {
      await client.query('COMMIT');
      return { sent: false };
    }

    const token = await createEmailToken(client, {
      userId: identity.user_id,
      purpose: 'verify_email',
      ttlMs: VERIFY_TOKEN_TTL_MS,
    });

    await client.query('COMMIT');
    const sent = await deliver(
      () => sendVerificationEmail({ to: safeEmail, displayName: identity.display_name, token }),
      'verification'
    );

    return { sent };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const LOGIN_FAILED_MESSAGE = 'Email hoặc mật khẩu không đúng';
export const EMAIL_NOT_VERIFIED_MESSAGE =
  'Bạn cần xác minh email trước khi đăng nhập. Hãy kiểm tra hộp thư của bạn.';

export async function loginWithPassword({ email, password }) {
  const safeEmail = normalizeEmail(email);

  const client = await pool.connect();

  try {
    const identity = safeEmail ? await findPasswordIdentity(client, safeEmail) : null;

    // Hash a throwaway value when the account does not exist so that a missing
    // account and a wrong password take the same amount of time — otherwise the
    // response time alone reveals which addresses are registered.
    const storedHash = identity?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordMatches = await bcrypt.compare(String(password ?? ''), storedHash);

    if (!identity || !passwordMatches) {
      return { error: LOGIN_FAILED_MESSAGE, status: 401 };
    }

    if (!identity.verified_at) {
      return { error: EMAIL_NOT_VERIFIED_MESSAGE, status: 403, needsVerification: true };
    }

    await client.query('BEGIN');
    const updated = await client.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1 RETURNING *',
      [identity.user_id]
    );
    const session = await issueSessionForUser(client, updated.rows[0]);
    await client.query('COMMIT');

    return { session };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function requestPasswordReset(email) {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) {
    return { sent: false };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const identity = await findPasswordIdentity(client, safeEmail);
    if (!identity) {
      // No password login here — possibly a Google-only account. Sending a
      // reset link would both leak that fact and be useless.
      await client.query('COMMIT');
      return { sent: false };
    }

    const token = await createEmailToken(client, {
      userId: identity.user_id,
      purpose: 'reset_password',
      ttlMs: RESET_TOKEN_TTL_MS,
    });

    await client.query('COMMIT');
    const sent = await deliver(
      () => sendPasswordResetEmail({ to: safeEmail, displayName: identity.display_name, token }),
      'password reset'
    );

    return { sent };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function resetPasswordWithToken({ token, password }) {
  const safePassword = validatePassword(password);

  if (typeof token !== 'string' || token.trim().length === 0) {
    return null;
  }

  const passwordHash = await bcrypt.hash(safePassword, BCRYPT_ROUNDS);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userId = await consumeEmailToken(client, {
      token: token.trim(),
      purpose: 'reset_password',
    });
    if (!userId) {
      await client.query('ROLLBACK');
      return null;
    }

    // Reaching the reset link proves control of the mailbox, so the identity
    // counts as verified from here on.
    await client.query(
      `
        UPDATE user_identities
        SET password_hash = $2,
            verified_at = COALESCE(verified_at, NOW())
        WHERE user_id = $1 AND provider = 'password'
      `,
      [userId, passwordHash]
    );

    const updated = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');

    // Whoever forced the reset (or was already logged in with the old password)
    // is kicked out everywhere.
    await revokeAllRefreshTokensForUser(userId);

    return { user: mapAuthUser(updated.rows[0]) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
