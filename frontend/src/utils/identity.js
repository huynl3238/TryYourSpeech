// Who the app thinks you are.
//
// This used to be a per-device identity kept in localStorage: the browser made
// up a userId, chose its own role, and every API call carried it. That is gone —
// the signed-in Google account is the only identity now, and the backend derives
// it from the auth cookie instead of believing what the client sends.
//
// What remains is an in-memory mirror of the signed-in user so the few non-React
// helpers (realtime notifications, toasts) can read it synchronously without
// threading context through them. AuthContext owns it and keeps it in sync.
let currentIdentity = null;

export function setIdentityFromAccount(user) {
  currentIdentity = user
    ? {
      userId: user.id,
      userRole: user.userRole || 'student',
      displayName: user.displayName || '',
      band: user.band ?? null,
    }
    : null;
}

export function getIdentity() {
  return currentIdentity;
}

export function isMentor() {
  return currentIdentity?.userRole === 'mentor';
}
