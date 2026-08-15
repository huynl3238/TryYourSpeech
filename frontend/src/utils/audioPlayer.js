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

// Có nên đi dò độ dài thật của file không. Hai điều kiện, và cả hai đều quan
// trọng: chỉ dò khi con số trình duyệt đưa ra không dùng được, và chỉ dò MỘT lần.
// Thiếu vế thứ hai thì mỗi lần trình duyệt báo lại độ dài sẽ kích hoạt một lần
// tua nữa, thành vòng lặp tự nuôi và thanh tiến độ không bao giờ đứng yên.
export function shouldProbeDuration(mediaDuration, probeState) {
  if (probeState !== 'idle') {
    return false;
  }

  return !(Number.isFinite(mediaDuration) && mediaDuration > 0);
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
