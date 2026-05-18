import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldUseContinuousMode,
  summarizePronunciationResults,
} from '../src/services/azurePronunciationAssessment.js';

test('shouldUseContinuousMode uses continuous mode for audio at least 30 seconds', () => {
  assert.equal(shouldUseContinuousMode(29999), false);
  assert.equal(shouldUseContinuousMode(30000), true);
  assert.equal(shouldUseContinuousMode(90000), true);
});

test('summarizePronunciationResults returns weighted scores and word detail', () => {
  const summary = summarizePronunciationResults([
    {
      DisplayText: 'I work.',
      NBest: [{
        PronunciationAssessment: {
          PronScore: 80,
          AccuracyScore: 70,
          FluencyScore: 90,
        },
        Words: [
          {
            Word: 'I',
            Offset: 100,
            Duration: 200,
            PronunciationAssessment: {
              AccuracyScore: 60,
              ErrorType: 'None',
            },
          },
          {
            Word: 'work',
            Offset: 400,
            Duration: 500,
            PronunciationAssessment: {
              AccuracyScore: 80,
              ErrorType: 'None',
            },
          },
        ],
      }],
    },
    {
      DisplayText: 'As cabin crew.',
      NBest: [{
        PronunciationAssessment: {
          PronScore: 90,
          AccuracyScore: 85,
          FluencyScore: 95,
          ProsodyScore: 75,
        },
        Words: [
          {
            Word: 'as',
            Offset: 900,
            Duration: 200,
            PronunciationAssessment: {
              AccuracyScore: 85,
              ErrorType: 'Mispronunciation',
            },
          },
        ],
      }],
    },
  ]);

  assert.equal(summary.pronunciationScore, 83.3);
  assert.equal(summary.accuracyScore, 75);
  assert.equal(summary.fluencyScore, 91.7);
  assert.equal(summary.prosodyScore, 75);
  assert.equal(summary.recognizedText, 'I work. As cabin crew.');
  assert.deepEqual(summary.detail.map((word) => word.word), ['I', 'work', 'as']);
  assert.equal(summary.detail[2].errorType, 'Mispronunciation');
});
