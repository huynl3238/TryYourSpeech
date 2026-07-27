const configuredClientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const developmentOrigins = new Set([
  configuredClientUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.102.148:5173',
]);

function isTryCloudflareOrigin(origin) {
  if (process.env.NODE_ENV !== 'development') return false;

  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith('.trycloudflare.com');
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  return developmentOrigins.has(origin) || isTryCloudflareOrigin(origin);
}

export const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin is not allowed'));
  },
  // Auth cookies only travel cross-origin when credentials are allowed. In
  // production the SPA and API share an origin (nginx), so this matters for the
  // local dev setup where Vite runs on :5173 and the API on :3001.
  credentials: true,
};
