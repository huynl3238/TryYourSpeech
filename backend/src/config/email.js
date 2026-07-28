const REQUIRED_EMAIL_CONFIG = ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'];

export function getMissingEmailConfigNames() {
  return REQUIRED_EMAIL_CONFIG.filter((name) => !process.env[name]);
}

export function isEmailConfigured() {
  return getMissingEmailConfigNames().length === 0;
}

// Same shape as the AI and auth status blocks in /api/health: names only, never
// the values.
export function getEmailConfigStatus() {
  const missing = getMissingEmailConfigNames();

  return {
    ok: missing.length === 0,
    configured: REQUIRED_EMAIL_CONFIG.filter((name) => Boolean(process.env[name])),
    missing,
  };
}

export function getEmailRuntimeConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    appUrl: (process.env.APP_URL || '').replace(/\/+$/, ''),
  };
}
