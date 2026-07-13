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

test('mentor review endpoint rejects malformed identifiers before database access', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/api/mentor-reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'bad',
        mentorId: 'bad',
        studentId: 'bad',
        overallComment: '',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'sessionId is invalid');
  } finally {
    server.close();
  }
});

test('practice history endpoint rejects malformed user id before database access', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/api/users/bad/practice-history`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'userId is invalid');
  } finally {
    server.close();
  }
});

test('profile endpoints reject malformed requests before database access', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const getResponse = await fetch(`${baseUrl}/api/users/bad/profile`);
    const getBody = await getResponse.json();

    assert.equal(getResponse.status, 400);
    assert.equal(getBody.error, 'userId is invalid');

    const patchResponse = await fetch(`${baseUrl}/api/users/11111111-1111-4111-8111-111111111111/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    });
    const patchBody = await patchResponse.json();

    assert.equal(patchResponse.status, 400);
    assert.equal(patchBody.error, 'request body is invalid');
  } finally {
    server.close();
  }
});

test('notification endpoints reject malformed requests before database access', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const listResponse = await fetch(`${baseUrl}/api/users/bad/notifications`);
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 400);
    assert.equal(listBody.error, 'userId is invalid');

    const readResponse = await fetch(`${baseUrl}/api/users/11111111-1111-4111-8111-111111111111/notifications/bad/read`, {
      method: 'PATCH',
    });
    const readBody = await readResponse.json();

    assert.equal(readResponse.status, 400);
    assert.equal(readBody.error, 'notificationId is invalid');
  } finally {
    server.close();
  }
});

test('topic endpoints reject malformed requests before database access', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const getResponse = await fetch(`${baseUrl}/api/topics/bad`);
    const getBody = await getResponse.json();

    assert.equal(getResponse.status, 400);
    assert.equal(getBody.error, 'topicId is invalid');

    const createResponse = await fetch(`${baseUrl}/api/topics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 400);
    assert.equal(createBody.error, 'request body is invalid');

    const questionResponse = await fetch(`${baseUrl}/api/topics/11111111-1111-4111-8111-111111111111/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partNumber: 1, questionText: '' }),
    });
    const questionBody = await questionResponse.json();

    assert.equal(questionResponse.status, 400);
    assert.equal(questionBody.error, 'questionText is required');

    const deleteResponse = await fetch(`${baseUrl}/api/questions/bad`, {
      method: 'DELETE',
    });
    const deleteBody = await deleteResponse.json();

    assert.equal(deleteResponse.status, 400);
    assert.equal(deleteBody.error, 'questionId is invalid');
  } finally {
    server.close();
  }
});

test('classroom endpoints reject malformed requests before database access', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const detailResponse = await fetch(`${baseUrl}/api/classroom/posts/bad`);
    const detailBody = await detailResponse.json();

    assert.equal(detailResponse.status, 400);
    assert.equal(detailBody.error, 'postId is invalid');

    const publishResponse = await fetch(`${baseUrl}/api/classroom/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'bad',
        userId: 'bad',
        title: '',
      }),
    });
    const publishBody = await publishResponse.json();

    assert.equal(publishResponse.status, 400);
    assert.equal(publishBody.error, 'sessionId is invalid');

    const commentResponse = await fetch(`${baseUrl}/api/classroom/posts/bad/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 'bad',
        commentText: '',
      }),
    });
    const commentBody = await commentResponse.json();

    assert.equal(commentResponse.status, 400);
    assert.equal(commentBody.error, 'postId is invalid');

    const likeResponse = await fetch(`${baseUrl}/api/classroom/posts/11111111-1111-4111-8111-111111111111/like`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 'bad',
      }),
    });
    const likeBody = await likeResponse.json();

    assert.equal(likeResponse.status, 400);
    assert.equal(likeBody.error, 'userId is invalid');

    const saveResponse = await fetch(`${baseUrl}/api/classroom/posts/11111111-1111-4111-8111-111111111111/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    });
    const saveBody = await saveResponse.json();

    assert.equal(saveResponse.status, 400);
    assert.equal(saveBody.error, 'request body is invalid');
  } finally {
    server.close();
  }
});

test('student work endpoint rejects malformed limit before database access', async () => {
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/api/teacher/student-work?limit=bad`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'limit must be a positive integer');
  } finally {
    server.close();
  }
});
