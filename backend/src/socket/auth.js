import { ACCESS_TOKEN_COOKIE } from '../config/auth.js';
import { getAuthUserById, verifyAccessToken } from '../models/authModel.js';

// Socket.IO handshakes are plain HTTP upgrades, so the auth cookie rides along
// with them — but there is no cookie-parser in this pipeline, hence the manual
// split. Values are URL-encoded by the browser.
function readCookie(cookieHeader, name) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() !== name) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

function readHandshakeToken(socket) {
  const fromCookie = readCookie(socket.handshake.headers?.cookie, ACCESS_TOKEN_COOKIE);
  if (fromCookie) {
    return fromCookie;
  }

  // Fallback for non-browser clients (tests, scripts) that cannot set cookies.
  const fromAuth = socket.handshake.auth?.token;
  return typeof fromAuth === 'string' && fromAuth.length > 0 ? fromAuth : null;
}

// Identity is established once, here, from a signed token — never from a
// payload the client sends later. Everything downstream reads socket.data.user,
// so a client cannot claim to be somebody else by editing an event.
export function authenticateSocket(socket, next) {
  const token = readHandshakeToken(socket);
  if (!token) {
    next(new Error('unauthorized'));
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload?.sub) {
    next(new Error('unauthorized'));
    return;
  }

  // Role comes from the DB, not the token, so a revoked mentor loses realtime
  // privileges immediately instead of when their access token expires.
  getAuthUserById(payload.sub)
    .then((user) => {
      if (!user) {
        next(new Error('unauthorized'));
        return;
      }

      socket.data.user = user;
      next();
    })
    .catch((err) => {
      console.error('Socket authentication failed:', err.message);
      next(new Error('unauthorized'));
    });
}
