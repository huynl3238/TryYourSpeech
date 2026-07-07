import assert from 'node:assert/strict';
import test from 'node:test';
import { azureToPronunciationBand } from '../src/services/pronunciationScoring.js';

test('azureToPronunciationBand maps high acoustic scores to high bands', () => {
  assert.equal(azureToPronunciationBand({ pronunciationScore: 96 }), 8.5);
  assert.equal(azureToPronunciationBand({ pronunciationScore: 89 }), 8);
  assert.equal(azureToPronunciationBand({ pronunciationScore: 73 }), 7);
  assert.equal(azureToPronunciationBand({ pronunciationScore: 60 }), 6);
});

test('azureToPronunciationBand maps low acoustic scores to low bands', () => {
  assert.equal(azureToPronunciationBand({ pronunciationScore: 45 }), 5);
  assert.equal(azureToPronunciationBand({ pronunciationScore: 20 }), 4);
});

test('azureToPronunciationBand falls back to accuracy when overall score is missing', () => {
  assert.equal(azureToPronunciationBand({ accuracyScore: 82 }), 7.5);
});

test('azureToPronunciationBand returns null when no acoustic score is available', () => {
  assert.equal(azureToPronunciationBand({}), null);
  assert.equal(azureToPronunciationBand(null), null);
});
