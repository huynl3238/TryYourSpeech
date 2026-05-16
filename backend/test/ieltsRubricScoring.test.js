import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRequiredScoringMetricNames,
  scoreSpeakingTurn,
} from '../src/services/ieltsRubricScoring.js';

const strongPartTwoMetrics = {
  grammarErrors: 2,
  collocationsCorrect: 8,
  advancedVocabularyItems: 8,
  idiomsUsed: 3,
  pauses: 2,
  falseStarts: 1,
  connectors: 7,
  complexSentences: 6,
  unclearWords: 1,
};

test('scoreSpeakingTurn applies part-specific IELTS rubric thresholds', () => {
  const result = scoreSpeakingTurn({
    partNumber: 2,
    metrics: strongPartTwoMetrics,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.scores, {
    fluency: 8,
    lexical: 8,
    grammar: 8,
    pronunciation: 8,
  });
  assert.equal(result.rawBand, 8);
  assert.equal(result.roundedBand, 8);
});

test('scoreSpeakingTurn rounds mixed criteria to the nearest half band', () => {
  const result = scoreSpeakingTurn({
    partNumber: 3,
    metrics: {
      grammarErrors: 4,
      collocationsCorrect: 5,
      advancedVocabularyItems: 6,
      idiomsUsed: 2,
      pauses: 7,
      falseStarts: 4,
      connectors: 3,
      complexSentences: 4,
      unclearWords: 3,
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.scores, {
    fluency: 6,
    lexical: 7,
    grammar: 7,
    pronunciation: 6,
  });
  assert.equal(result.rawBand, 6.5);
  assert.equal(result.roundedBand, 6.5);
});

test('scoreSpeakingTurn reports missing metrics instead of guessing', () => {
  const result = scoreSpeakingTurn({
    partNumber: 1,
    metrics: {
      grammarErrors: 1,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.scores, null);
  assert.match(result.reason, /collocationsCorrect/);
});

test('getRequiredScoringMetricNames returns a defensive copy', () => {
  const names = getRequiredScoringMetricNames();
  names.push('extra');

  assert.equal(getRequiredScoringMetricNames().includes('extra'), false);
});
