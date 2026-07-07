// Maps Azure's acoustic pronunciation scores (0-100) onto the IELTS Speaking
// Pronunciation band. IELTS pronunciation is holistic (intelligibility, phonetic
// features, L1 influence), so this is a calibrated approximation grounded in
// Azure's objective measurements rather than an exact 1:1 conversion. Azure cannot
// reliably distinguish native-like band 9 speech, so the scale is capped at 8.5.

const BAND_THRESHOLDS = [
  { minScore: 95, band: 8.5 },
  { minScore: 88, band: 8 },
  { minScore: 80, band: 7.5 },
  { minScore: 72, band: 7 },
  { minScore: 64, band: 6.5 },
  { minScore: 56, band: 6 },
  { minScore: 48, band: 5.5 },
  { minScore: 40, band: 5 },
  { minScore: 30, band: 4.5 },
];

const LOWEST_BAND = 4;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Azure's PronScore already blends accuracy, fluency and prosody, so prefer it and
// fall back to accuracy when prosody-based scoring is unavailable.
function getCompositeScore({ pronunciationScore, accuracyScore }) {
  if (isFiniteNumber(pronunciationScore)) {
    return pronunciationScore;
  }

  if (isFiniteNumber(accuracyScore)) {
    return accuracyScore;
  }

  return null;
}

export function azureToPronunciationBand(pronunciation) {
  const compositeScore = getCompositeScore(pronunciation || {});
  if (compositeScore === null) {
    return null;
  }

  const match = BAND_THRESHOLDS.find((threshold) => compositeScore >= threshold.minScore);
  return match ? match.band : LOWEST_BAND;
}
