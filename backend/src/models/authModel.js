import { createHash, randomBytes, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { getAuthRuntimeConfig } from '../config/auth.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

export function mapAuthUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email || null,
    avatarUrl: row.avatar_url || null,
    band: toNumberOrNull(row.band),
    userRole: row.user_role || 'student',
    createdAt: toIsoString(row.created_at),
  };
}

// Refresh tokens are opaque random strings; only their SHA-256 hash is stored,
// so a database leak cannot be replayed against the API. Email links are hashed
// the same way, hence the export.
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(user) {
  const { jwtSecret, accessTokenTtlSeconds } = getAuthRuntimeConfig();

  return jwt.sign(
    {
      sub: user.id,
      role: user.userRole,
    },
    jwtSecret,
    { expiresIn: accessTokenTtlSeconds }
  );
}

export function verifyAccessToken(token) {
  const { jwtSecret } = getAuthRuntimeConfig();

  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
}

async function insertRefreshToken(client, userId) {
  const { refreshTokenTtlDays } = getAuthRuntimeConfig();
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + refreshTokenTtlDays * DAY_MS);

  await client.query(
    `
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [randomUUID(), userId, hashToken(token), expiresAt]
  );

  return { token, expiresAt };
}

// Turns a users row into a signed-in session. Shared by every way of proving
// who you are (Google today, email + password as well) so all of them mint
// tokens with the same lifetimes and rotation rules.
export async function issueSessionForUser(client, userRow) {
  const user = mapAuthUser(userRow);
  const refreshToken = await insertRefreshToken(client, user.id);

  return {
    user,
    accessToken: signAccessToken(user),
    refreshToken: refreshToken.token,
    refreshTokenExpiresAt: refreshToken.expiresAt,
  };
}

async function findUserByEmail(client, email) {
  if (!email) {
    return null;
  }

  const result = await client.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  return result.rows[0] || null;
}

// Signs a Google account in, creating the app user on first visit. New accounts
// are always plain students — mentor/admin are granted later by an admin, never
// self-selected, which is what made the old device-based identity unsafe.
export async function findOrCreateUserFromGoogle({ providerUserId, email, displayName, avatarUrl }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const identityResult = await client.query(
      `
        SELECT u.*
        FROM user_identities ui
        JOIN users u ON u.id = ui.user_id
        WHERE ui.provider = 'google' AND ui.provider_user_id = $1
      `,
      [providerUserId]
    );

    let user = identityResult.rows[0] || null;

    if (!user) {
      // Same verified email as an existing account: link this Google identity to
      // it instead of creating a duplicate person.
      const existingByEmail = await findUserByEmail(client, email);

      if (existingByEmail) {
        user = existingByEmail;
      } else {
        const created = await client.query(
          `
            INSERT INTO users (id, display_name, email, avatar_url, user_role)
            VALUES ($1, $2, $3, $4, 'student')
            RETURNING *
          `,
          [randomUUID(), displayName.slice(0, 100), email, avatarUrl]
        );
        user = created.rows[0];
      }

      await client.query(
        `
          INSERT INTO user_identities (id, user_id, provider, provider_user_id, email)
          VALUES ($1, $2, 'google', $3, $4)
          ON CONFLICT (provider, provider_user_id) DO NOTHING
        `,
        [randomUUID(), user.id, providerUserId, email]
      );
    }

    const refreshed = await client.query(
      `
        UPDATE users
        SET last_login_at = NOW(),
            avatar_url = COALESCE($2, avatar_url),
            email = COALESCE(email, $3)
        WHERE id = $1
        RETURNING *
      `,
      [user.id, avatarUrl, email]
    );

    const session = await issueSessionForUser(client, refreshed.rows[0]);

    await client.query('COMMIT');

    return session;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Rotates the refresh token: the presented one is revoked and a fresh one
// issued, so a stolen token stops working as soon as the real user refreshes.
export async function rotateRefreshToken(presentedToken) {
  if (typeof presentedToken !== 'string' || presentedToken.trim().length === 0) {
    return null;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        -- rt.id must be aliased: u.* also selects an "id" column and the last
        -- one wins, which would otherwise revoke by the user's id and silently
        -- leave the rotated token valid.
        SELECT rt.id AS refresh_token_id, u.*
        FROM refresh_tokens rt
        JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
          AND rt.revoked_at IS NULL
          AND rt.expires_at > NOW()
        FOR UPDATE OF rt
      `,
      [hashToken(presentedToken.trim())]
    );

    const row = result.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
      [row.refresh_token_id]
    );

    const user = mapAuthUser(row);
    const nextToken = await insertRefreshToken(client, user.id);

    await client.query('COMMIT');

    return {
      user,
      accessToken: signAccessToken(user),
      refreshToken: nextToken.token,
      refreshTokenExpiresAt: nextToken.expiresAt,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeRefreshToken(presentedToken) {
  if (typeof presentedToken !== 'string' || presentedToken.trim().length === 0) {
    return false;
  }

  const result = await pool.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = $1 AND revoked_at IS NULL
    `,
    [hashToken(presentedToken.trim())]
  );

  return result.rowCount > 0;
}

export async function revokeAllRefreshTokensForUser(userId) {
  await pool.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL
    `,
    [userId]
  );
}

export async function getAuthUserById(userId) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  return mapAuthUser(result.rows[0] || null);
}
