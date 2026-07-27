const REQUIRED_AUTH_CONFIG = [
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
];

// Access tokens are short-lived because they cannot be revoked once issued;
// the long-lived refresh token lives in the DB and can be revoked at any time.
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 30;

const ACCESS_TOKEN_COOKIE = 'tys_access';
const REFRESH_TOKEN_COOKIE = 'tys_refresh';

function hasEnvValue(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0;
}

function readIntEnv(name, fallback) {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

export function getMissingAuthConfigNames() {
  return REQUIRED_AUTH_CONFIG.filter((name) => !hasEnvValue(name));
}

export function isAuthConfigured() {
  return getMissingAuthConfigNames().length === 0;
}

export function getAuthConfigStatus() {
  const missing = getMissingAuthConfigNames();
  return {
    configured: missing.length === 0,
    missing,
  };
}

export function getAuthRuntimeConfig() {
  return {
    jwtSecret: process.env.JWT_SECRET || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    accessTokenTtlSeconds: readIntEnv('ACCESS_TOKEN_TTL_SECONDS', DEFAULT_ACCESS_TOKEN_TTL_SECONDS),
    refreshTokenTtlDays: readIntEnv('REFRESH_TOKEN_TTL_DAYS', DEFAULT_REFRESH_TOKEN_TTL_DAYS),
  };
}

// Cookies are httpOnly so page scripts (and any injected XSS) cannot read the
// tokens. 'lax' still sends them on top-level navigation to our own origin,
// which is all the SPA needs since frontend and API share a domain via nginx.
export function getCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };
