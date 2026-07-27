import { ACCESS_TOKEN_COOKIE } from '../config/auth.js';
import { getAuthUserById, verifyAccessToken } from '../models/authModel.js';

function readAccessToken(req) {
  const fromCookie = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }

  // Bearer header support keeps non-browser clients (tests, scripts) working.
  const header = req.get('authorization');
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  return null;
}

// Resolves the caller from the access token, if any. The role is re-read from
// the DB rather than trusted from the token body, so revoking someone's mentor
// rights takes effect immediately instead of when their token expires.
async function resolveUser(req) {
  const token = readAccessToken(req);
  if (!token) {
    return null;
  }

  const payload = verifyAccessToken(token);
  if (!payload?.sub) {
    return null;
  }

  return await getAuthUserById(payload.sub);
}

export async function attachUser(req, _res, next) {
  try {
    req.user = await resolveUser(req);
  } catch (err) {
    console.warn('Failed to resolve request user:', err.message);
    req.user = null;
  }

  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Bạn cần đăng nhập để thực hiện thao tác này' });
    return;
  }

  next();
}

export function requireRole(...roles) {
  const allowed = new Set(roles);

  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Bạn cần đăng nhập để thực hiện thao tác này' });
      return;
    }

    if (!allowed.has(req.user.userRole)) {
      res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });
      return;
    }

    next();
  };
}
