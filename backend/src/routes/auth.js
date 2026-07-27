import { Router } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getAuthRuntimeConfig,
  getCookieOptions,
  isAuthConfigured,
} from '../config/auth.js';
import {
  findOrCreateUserFromGoogle,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../models/authModel.js';
import { verifyGoogleIdToken } from '../services/googleAuth.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function setAuthCookies(res, { accessToken, refreshToken, refreshTokenExpiresAt }) {
  const { accessTokenTtlSeconds } = getAuthRuntimeConfig();

  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, getCookieOptions(accessTokenTtlSeconds * 1000));
  res.cookie(
    REFRESH_TOKEN_COOKIE,
    refreshToken,
    getCookieOptions(Math.max(0, new Date(refreshTokenExpiresAt).getTime() - Date.now()))
  );
}

function clearAuthCookies(res) {
  const options = getCookieOptions(0);
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
}

function requireAuthConfigured(_req, res, next) {
  if (!isAuthConfigured()) {
    res.status(503).json({ error: 'Đăng nhập chưa được cấu hình trên máy chủ' });
    return;
  }

  next();
}

router.post('/google', requireAuthConfigured, async (req, res) => {
  try {
    const idToken = req.body?.idToken;
    const profile = await verifyGoogleIdToken(idToken);
    const session = await findOrCreateUserFromGoogle(profile);

    setAuthCookies(res, session);
    res.json({ user: session.user });
  } catch (err) {
    console.warn('Google sign-in failed:', err.message);
    res.status(401).json({ error: err.message });
  }
});

router.post('/refresh', requireAuthConfigured, async (req, res) => {
  try {
    const presented = req.cookies?.[REFRESH_TOKEN_COOKIE];
    const session = await rotateRefreshToken(presented);

    if (!session) {
      clearAuthCookies(res);
      res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
      return;
    }

    setAuthCookies(res, session);
    res.json({ user: session.user });
  } catch (err) {
    console.error('Failed to refresh session:', err.message);
    res.status(500).json({ error: 'Không thể làm mới phiên đăng nhập' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    await revokeRefreshToken(req.cookies?.[REFRESH_TOKEN_COOKIE]);
  } catch (err) {
    console.warn('Failed to revoke refresh token on logout:', err.message);
  }

  clearAuthCookies(res);
  res.json({ loggedOut: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ user: req.user });
});

export default router;
