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
import {
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  resendVerificationEmail,
  resetPasswordWithToken,
  verifyEmailWithToken,
} from '../models/passwordAuthModel.js';
import { isEmailConfigured } from '../config/email.js';
import { verifyGoogleIdToken } from '../services/googleAuth.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Deliberately vague: the caller must not learn whether an address is
// registered, so every outcome of register / forgot-password reads the same.
const CHECK_INBOX_MESSAGE =
  'Nếu địa chỉ email này dùng được, chúng tôi đã gửi một email hướng dẫn. Hãy kiểm tra hộp thư (kể cả mục spam).';

const emailBodyKey = (req) => req.body?.email;

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

// Password sign-in depends on being able to mail a verification link, so
// without a mail provider the whole flow is disabled rather than half-working.
function requireEmailConfigured(_req, res, next) {
  if (!isEmailConfigured()) {
    res.status(503).json({
      error: 'Đăng nhập bằng mật khẩu chưa được cấu hình trên máy chủ (thiếu dịch vụ gửi email)',
    });
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

router.post(
  '/register',
  requireAuthConfigured,
  requireEmailConfigured,
  rateLimit({ name: 'register', limit: 5, windowSeconds: 3600, keyFromBody: emailBodyKey }),
  async (req, res) => {
    try {
      await registerWithPassword({
        email: req.body?.email,
        password: req.body?.password,
        displayName: req.body?.displayName,
      });

      res.status(202).json({ message: CHECK_INBOX_MESSAGE });
    } catch (err) {
      // Only shape errors (bad email, short password) reach the client; a mail
      // provider outage must not tell the caller whether the address existed.
      if (err.message.startsWith('Địa chỉ email') || err.message.startsWith('Mật khẩu') || err.message.startsWith('Tên hiển thị')) {
        res.status(400).json({ error: err.message });
        return;
      }

      console.error('Registration failed:', err.message);
      res.status(500).json({ error: 'Không thể tạo tài khoản lúc này. Vui lòng thử lại sau.' });
    }
  }
);

router.post(
  '/login',
  requireAuthConfigured,
  rateLimit({ name: 'login', limit: 10, windowSeconds: 900, keyFromBody: emailBodyKey }),
  async (req, res) => {
    try {
      const result = await loginWithPassword({
        email: req.body?.email,
        password: req.body?.password,
      });

      if (result.error) {
        res.status(result.status).json({
          error: result.error,
          needsVerification: result.needsVerification || undefined,
        });
        return;
      }

      setAuthCookies(res, result.session);
      res.json({ user: result.session.user });
    } catch (err) {
      console.error('Password login failed:', err.message);
      res.status(500).json({ error: 'Không thể đăng nhập lúc này. Vui lòng thử lại sau.' });
    }
  }
);

router.post('/verify-email', requireAuthConfigured, async (req, res) => {
  try {
    const session = await verifyEmailWithToken(req.body?.token);

    if (!session) {
      res.status(400).json({
        error: 'Đường dẫn xác minh không hợp lệ hoặc đã hết hạn. Hãy yêu cầu gửi lại email.',
      });
      return;
    }

    setAuthCookies(res, session);
    res.json({ user: session.user });
  } catch (err) {
    console.error('Email verification failed:', err.message);
    res.status(500).json({ error: 'Không thể xác minh email lúc này' });
  }
});

router.post(
  '/resend-verification',
  requireAuthConfigured,
  requireEmailConfigured,
  rateLimit({ name: 'resend', limit: 3, windowSeconds: 3600, keyFromBody: emailBodyKey }),
  async (req, res) => {
    try {
      await resendVerificationEmail(req.body?.email);
    } catch (err) {
      console.error('Failed to resend verification email:', err.message);
    }

    res.json({ message: CHECK_INBOX_MESSAGE });
  }
);

router.post(
  '/forgot-password',
  requireAuthConfigured,
  requireEmailConfigured,
  rateLimit({ name: 'forgot', limit: 5, windowSeconds: 3600, keyFromBody: emailBodyKey }),
  async (req, res) => {
    try {
      await requestPasswordReset(req.body?.email);
    } catch (err) {
      // Swallowed on purpose: the response is identical either way.
      console.error('Failed to send password reset email:', err.message);
    }

    res.json({ message: CHECK_INBOX_MESSAGE });
  }
);

router.post(
  '/reset-password',
  requireAuthConfigured,
  rateLimit({ name: 'reset', limit: 10, windowSeconds: 3600 }),
  async (req, res) => {
    try {
      const result = await resetPasswordWithToken({
        token: req.body?.token,
        password: req.body?.password,
      });

      if (!result) {
        res.status(400).json({
          error: 'Đường dẫn đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
        });
        return;
      }

      // Not signed in here on purpose: after a reset the person should prove
      // the new password works, and any stolen session is already revoked.
      clearAuthCookies(res);
      res.json({ message: 'Đã đổi mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.' });
    } catch (err) {
      if (err.message.startsWith('Mật khẩu')) {
        res.status(400).json({ error: err.message });
        return;
      }

      console.error('Password reset failed:', err.message);
      res.status(500).json({ error: 'Không thể đặt lại mật khẩu lúc này' });
    }
  }
);

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
