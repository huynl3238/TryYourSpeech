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

// When Azure cannot measure prosody (intonation/stress/rhythm) it returns null, and
// its overall PronScore is then computed WITHOUT that dimension — which runs
// optimistically high, because prosody is exactly where L1-influenced speakers lose
// marks. In that case we do NOT trust PronScore: we re-derive the composite from the
// dimensions Azure actually measured (accuracy, fluency) and cap the resulting band,
// since native-like delivery cannot be confirmed without prosody data.
const PROSODY_MISSING_BAND_CAP = 7;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function mean(values) {
  const finite = values.filter(isFiniteNumber);
  if (finite.length === 0) {
    return null;
  }

  return finite.reduce((total, value) => total + value, 0) / finite.length;
}

function bandFromScore(score) {
  const match = BAND_THRESHOLDS.find((threshold) => score >= threshold.minScore);
  return match ? match.band : LOWEST_BAND;
}

export function azureToPronunciationBand(pronunciation) {
  const scores = pronunciation || {};

  // Prosody available → Azure's PronScore already blends accuracy, fluency and
  // prosody, so prefer it; fall back to the mean of the measured dimensions.
  if (isFiniteNumber(scores.prosodyScore)) {
    const composite = isFiniteNumber(scores.pronunciationScore)
      ? scores.pronunciationScore
      : mean([scores.accuracyScore, scores.fluencyScore, scores.prosodyScore]);

    return composite === null ? null : bandFromScore(composite);
  }

  // Prosody missing → Azure's PronScore was computed without it and reads high, so we
  // still use the best available composite but cap the band conservatively, since
  // native-like delivery cannot be confirmed without prosody data.
  const composite = isFiniteNumber(scores.pronunciationScore)
    ? scores.pronunciationScore
    : mean([scores.accuracyScore, scores.fluencyScore]);

  if (composite === null) {
    return null;
  }

  return Math.min(bandFromScore(composite), PROSODY_MISSING_BAND_CAP);
}
