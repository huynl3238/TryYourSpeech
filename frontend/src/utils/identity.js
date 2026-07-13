// Lightweight per-device identity. Backs a real users row (id + role) so the
// mentor/student flows can call the API with a stable userId.
const ID_KEY = 'tryYourSpeech.currentUserId';
const ROLE_KEY = 'tryYourSpeech.userRole';
const NAME_KEY = 'tryYourSpeech.displayName';
const BAND_KEY = 'tryYourSpeech.band';

export function getIdentity() {
  const userId = localStorage.getItem(ID_KEY);
  if (!userId) {
    return null;
  }

  const bandRaw = localStorage.getItem(BAND_KEY);
  return {
    userId,
    userRole: localStorage.getItem(ROLE_KEY) || 'student',
    displayName: localStorage.getItem(NAME_KEY) || '',
    band: bandRaw === null || bandRaw === '' ? null : Number(bandRaw),
  };
}

export function saveIdentity({ userId, userRole, displayName, band }) {
  localStorage.setItem(ID_KEY, userId);
  localStorage.setItem(ROLE_KEY, userRole || 'student');
  localStorage.setItem(NAME_KEY, displayName || '');
  localStorage.setItem(BAND_KEY, band === null || band === undefined ? '' : String(band));
}

export function clearIdentity() {
  localStorage.removeItem(ID_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(BAND_KEY);
}

export function isMentor() {
  return localStorage.getItem(ROLE_KEY) === 'mentor';
}
