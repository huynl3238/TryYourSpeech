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

test('result and review endpoints reject malformed request identifiers', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const resultsResponse = await fetch(`${baseUrl}/api/results/bad?userId=bad`);
    const resultsBody = await resultsResponse.json();

    assert.equal(resultsResponse.status, 400);
    assert.equal(resultsBody.error, 'sessionId is invalid');

    const reviewResponse = await fetch(`${baseUrl}/api/review/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    });
    const reviewBody = await reviewResponse.json();

    assert.equal(reviewResponse.status, 400);
    assert.equal(reviewBody.error, 'request body is invalid');
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
    assert.ok(body.services.ai.missing.includes('GEMINI_API_KEY'));
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

test('peer notes endpoint rejects malformed notes before database access', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/api/peer-notes/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: '11111111-1111-4111-8111-111111111111',
        listenerId: '22222222-2222-4222-8222-222222222222',
        notes: [
          {
            turnId: '33333333-3333-4333-8333-333333333333',
            timestampMs: -1,
            errorType: 'bad',
            clientNoteId: '',
          },
        ],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'note.clientNoteId is required');
  } finally {
    server.close();
  }
});

test('result retry endpoint rejects malformed identifiers before database access', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/api/results/bad/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'bad', turnId: 'bad' }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'sessionId is invalid');
  } finally {
    server.close();
  }
});
