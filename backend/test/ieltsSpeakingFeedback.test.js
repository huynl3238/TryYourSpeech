import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFeedbackResponse } from '../src/services/ieltsSpeakingFeedback.js';

test('normalizeFeedbackResponse extracts bands and clamps them to the 4-9 half-band scale', () => {
  const normalized = normalizeFeedbackResponse({
    fluencyCoherence: { band: 7, evidence: '"I reckon"', feedback: 'Trôi chảy tốt.' },
    lexicalResource: { band: 6.4, evidence: 'good range', feedback: 'Dùng từ ổn.' },
    grammaticalRangeAccuracy: { band: 12, evidence: 'complex', feedback: 'Ngữ pháp tốt.' },
    overall: {
      summary: 'Bài nói tốt.',
      strengths: ['mạch lạc', ''],
      improvements: ['giảm lặp từ'],
    },
  });

  assert.deepEqual(normalized.scores, { fluency: 7, lexical: 6.5, grammar: 9 });
  assert.equal(normalized.criteria.fluencyCoherence.evidence, '"I reckon"');
  assert.deepEqual(normalized.overall.strengths, ['mạch lạc']);
  assert.deepEqual(normalized.overall.improvements, ['giảm lặp từ']);
});

test('normalizeFeedbackResponse tolerates missing or malformed fields', () => {
  const normalized = normalizeFeedbackResponse({
    fluencyCoherence: { band: 'not-a-number' },
    lexicalResource: null,
  });

  assert.deepEqual(normalized.scores, { fluency: null, lexical: null, grammar: null });
  assert.equal(normalized.criteria.grammaticalRangeAccuracy.feedback, '');
  assert.deepEqual(normalized.overall.strengths, []);
});

test('normalizeFeedbackResponse handles a non-object input', () => {
  const normalized = normalizeFeedbackResponse(undefined);

  assert.deepEqual(normalized.scores, { fluency: null, lexical: null, grammar: null });
  assert.equal(normalized.overall.summary, '');
});
