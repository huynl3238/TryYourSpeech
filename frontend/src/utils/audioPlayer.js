export function getPlayableDuration(mediaDuration, expectedDurationMs = 0) {
  const expectedSeconds = Number(expectedDurationMs) / 1000;
  const hasExpectedDuration = Number.isFinite(expectedSeconds) && expectedSeconds > 0;
  const metadataLooksValid = Number.isFinite(mediaDuration)
    && mediaDuration > 0
    && (!hasExpectedDuration || mediaDuration <= expectedSeconds * 4);

  if (metadataLooksValid) {
    return mediaDuration;
  }

  return hasExpectedDuration ? expectedSeconds : 0;
}

export function clampAudioTime(value, duration) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (!Number.isFinite(duration) || duration <= 0) {
    return Math.max(0, safeValue);
  }

  return Math.min(Math.max(0, safeValue), duration);
}

export function formatAudioTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
