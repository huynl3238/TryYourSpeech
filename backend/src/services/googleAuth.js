import { OAuth2Client } from 'google-auth-library';
import { getAuthRuntimeConfig } from '../config/auth.js';

let cachedClient = null;
let cachedClientId = null;

function getClient(clientId) {
  if (!cachedClient || cachedClientId !== clientId) {
    cachedClient = new OAuth2Client(clientId);
    cachedClientId = clientId;
  }

  return cachedClient;
}

// Verifies a Google ID token end to end: signature against Google's public
// keys, expiry, issuer, and that the token was minted for THIS app (audience).
// Skipping the audience check would let a token issued for any other Google app
// sign someone in here, so google-auth-library is given our client id directly.
export async function verifyGoogleIdToken(idToken) {
  if (typeof idToken !== 'string' || idToken.trim().length === 0) {
    throw new Error('Google ID token is required');
  }

  const { googleClientId } = getAuthRuntimeConfig();
  if (!googleClientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }

  let ticket;
  try {
    ticket = await getClient(googleClientId).verifyIdToken({
      idToken: idToken.trim(),
      audience: googleClientId,
    });
  } catch (err) {
    console.warn('Google ID token verification failed:', err.message);
    throw new Error('Google sign-in token is invalid');
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    throw new Error('Google sign-in token is invalid');
  }

  if (payload.email && payload.email_verified === false) {
    throw new Error('Google account email is not verified');
  }

  return {
    providerUserId: payload.sub,
    email: payload.email || null,
    displayName: payload.name || payload.email || 'Người dùng',
    avatarUrl: payload.picture || null,
  };
}
