import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/app.js';
import redis from '../src/config/redis.js';

function listen(appInstance) {
  return new Promise((resolve) => {
    const server = appInstance.listen(0, () => {
      resolve(server);
    });
  });
}

const SESSION_UUID = '11111111-1111-4111-8111-111111111111';

// Every endpoint that touches user data, in the shape a browser would call it.
// The point of this table is that adding a route without a guard fails here.
const PROTECTED_ROUTES = [
  ['GET', `/api/sessions/${SESSION_UUID}`],
  ['GET', `/api/users/${SESSION_UUID}/practice-history`],
  ['GET', `/api/users/${SESSION_UUID}/profile`],
  ['PATCH', `/api/users/${SESSION_UUID}/profile`, { displayName: 'X' }],
  ['GET', `/api/users/${SESSION_UUID}/notifications`],
  ['PATCH', `/api/users/${SESSION_UUID}/notifications/${SESSION_UUID}/read`],
  ['PATCH', `/api/users/${SESSION_UUID}/notifications/read-all`],
  ['GET', '/api/topics'],
  ['POST', '/api/topics', { name: 'X' }],
  ['GET', `/api/topics/${SESSION_UUID}`],
  ['PATCH', `/api/topics/${SESSION_UUID}`, { name: 'X' }],
  ['DELETE', `/api/topics/${SESSION_UUID}`],
  ['POST', `/api/topics/${SESSION_UUID}/questions`, { questionText: 'X', partNumber: 1 }],
  ['PATCH', `/api/questions/${SESSION_UUID}`, { questionText: 'X' }],
  ['DELETE', `/api/questions/${SESSION_UUID}`],
  ['GET', '/api/classroom/posts'],
  ['GET', `/api/classroom/posts/${SESSION_UUID}`],
  ['POST', '/api/classroom/posts', { sessionId: SESSION_UUID, title: 'X' }],
  ['POST', `/api/classroom/posts/${SESSION_UUID}/comments`, { commentText: 'X' }],
  ['POST', `/api/classroom/posts/${SESSION_UUID}/like`, {}],
  ['POST', `/api/classroom/posts/${SESSION_UUID}/save`, {}],
  ['POST', `/api/classroom/posts/${SESSION_UUID}/approve`, {}],
  ['POST', `/api/classroom/posts/${SESSION_UUID}/decline`, {}],
  ['GET', '/api/teacher/student-work'],
  ['POST', '/api/mentor-sessions', {}],
  ['GET', '/api/mentor-sessions'],
  ['GET', `/api/mentors/${SESSION_UUID}/sessions`],
  ['POST', `/api/mentor-sessions/${SESSION_UUID}/apply`, {}],
  ['POST', `/api/mentor-sessions/${SESSION_UUID}/leave`, {}],
  ['POST', `/api/mentor-sessions/${SESSION_UUID}/start`, { studentId: SESSION_UUID }],
  ['POST', `/api/mentor-sessions/${SESSION_UUID}/close`, {}],
  ['GET', `/api/results/${SESSION_UUID}`],
  ['POST', `/api/results/${SESSION_UUID}/retry`, {}],
  ['POST', '/api/audio/upload'],
  ['POST', '/api/peer-notes/batch', { sessionId: SESSION_UUID, notes: [] }],
  ['POST', '/api/mentor-reviews', { sessionId: SESSION_UUID, studentId: SESSION_UUID, overallComment: 'X' }],
  ['POST', '/api/review/complete', { sessionId: SESSION_UUID }],
  ['GET', '/api/admin/stats'],
  ['POST', '/api/mentor-applications', { message: 'X' }],
  ['GET', '/api/mentor-applications/me'],
  ['GET', '/api/admin/mentor-applications'],
  ['POST', `/api/admin/mentor-applications/${SESSION_UUID}/review`, { decision: 'approved' }],
  ['GET', '/api/admin/mentors'],
  ['POST', `/api/admin/mentors/${SESSION_UUID}/revoke`, {}],
];

async function callRoute(baseUrl, [method, path, body]) {
  return await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('every user-data endpoint refuses anonymous callers', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const failures = [];

    for (const route of PROTECTED_ROUTES) {
      const response = await callRoute(baseUrl, route);

      // 401 is the guard firing. Anything else means the request reached the
      // handler — including 400, which would mean validation ran on data from
      // an unauthenticated caller.
      if (response.status !== 401) {
        failures.push(`${route[0]} ${route[1]} -> ${response.status}`);
      }
    }

    assert.deepEqual(failures, []);
  } finally {
    server.close();
  }
});

test('anonymous rejection says so in Vietnamese rather than leaking details', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/api/results/${SESSION_UUID}`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, 'Bạn cần đăng nhập để thực hiện thao tác này');
  } finally {
    server.close();
  }
});

test('public endpoints stay reachable without signing in', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const rootResponse = await fetch(`${baseUrl}/api/`);
    assert.equal(rootResponse.status, 200);

    const configResponse = await fetch(`${baseUrl}/api/config`);
    const configBody = await configResponse.json();

    assert.equal(configResponse.status, 200);
    assert.ok(Array.isArray(configBody.iceServers));
  } finally {
    server.close();
  }
});

test('account creation by request body is gone', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // This used to mint a users row with a caller-chosen user_role.
    const response = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Ke gia mao', userRole: 'admin' }),
    });

    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});

test('health endpoint reports AI config names without exposing secret values', async () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'secret-value';

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.ok(body.services.ai);
    assert.deepEqual(body.services.ai.configured, ['OPENAI_API_KEY']);
    assert.ok(body.services.ai.missing.includes('AZURE_SPEECH_KEY'));
    assert.ok(body.services.ai.missing.includes('AZURE_SPEECH_REGION'));
    assert.equal(body.services.ai.provider.feedback, 'openai');
    assert.equal(JSON.stringify(body).includes('secret-value'), false);
  } finally {
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }

    redis.disconnect();
    server.close();
  }
});
