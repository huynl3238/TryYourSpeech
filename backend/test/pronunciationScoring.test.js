import assert from 'node:assert/strict';
import test from 'node:test';
import { azureToPronunciationBand } from '../src/services/pronunciationScoring.js';

test('azureToPronunciationBand maps high acoustic scores to high bands when prosody is present', () => {
  assert.equal(azureToPronunciationBand({ pronunciationScore: 96, prosodyScore: 95 }), 8.5);
  assert.equal(azureToPronunciationBand({ pronunciationScore: 89, prosodyScore: 88 }), 8);
  assert.equal(azureToPronunciationBand({ pronunciationScore: 73, prosodyScore: 70 }), 7);
  assert.equal(azureToPronunciationBand({ pronunciationScore: 60, prosodyScore: 58 }), 6);
});

test('azureToPronunciationBand maps low acoustic scores to low bands', () => {
  assert.equal(azureToPronunciationBand({ pronunciationScore: 45, prosodyScore: 40 }), 5);
  assert.equal(azureToPronunciationBand({ pronunciationScore: 20, prosodyScore: 18 }), 4);
});

test('azureToPronunciationBand caps the band conservatively when prosody is missing', () => {
  // Without prosody, Azure's PronScore reads optimistically high, so a would-be 8.5 is
  // capped at band 7 rather than trusted.
  assert.equal(azureToPronunciationBand({ pronunciationScore: 96 }), 7);
  // Below the cap, the score passes through unchanged.
  assert.equal(azureToPronunciationBand({ pronunciationScore: 60 }), 6);
});

test('azureToPronunciationBand falls back to accuracy/fluency when overall score is missing', () => {
  // Prosody missing and no PronScore: derive from accuracy/fluency, still capped at 7.
  assert.equal(azureToPronunciationBand({ accuracyScore: 82 }), 7);
  assert.equal(azureToPronunciationBand({ accuracyScore: 60, fluencyScore: 60 }), 6);
});

test('azureToPronunciationBand returns null when no acoustic score is available', () => {
  assert.equal(azureToPronunciationBand({}), null);
  assert.equal(azureToPronunciationBand(null), null);
});
