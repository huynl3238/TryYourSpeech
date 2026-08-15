import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSessionId } from './sessionIdentity.js';

test('restores session id from results opened from practice history', () => {
  assert.equal(resolveSessionId({
    sessionId: null,
    results: { sessionId: 'result-session-id' },
  }), 'result-session-id');
});

test('restores session id from session detail when results are not loaded yet', () => {
  assert.equal(resolveSessionId({
    sessionData: { session: { id: 'detail-session-id' } },
  }), 'detail-session-id');
});

test('keeps the live match session id as the final fallback', () => {
  assert.equal(resolveSessionId({ sessionId: 'live-session-id' }), 'live-session-id');
});

test('does not return an empty session id', () => {
  assert.equal(resolveSessionId({
    sessionId: '  ',
    sessionData: { session: { id: '' } },
    results: { sessionId: null },
  }), null);
});
