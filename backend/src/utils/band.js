export const BAND_MIN = 0;
export const BAND_MAX = 9;
export const BAND_STEP = 0.5;

export function isBandOmitted(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim().length === 0;
}

// Returns data instead of throwing so HTTP and socket callers can handle errors differently.
export function parseBand(value) {
  if (isBandOmitted(value)) {
    return { omitted: true };
  }

  // Number([]) and Number(false) are 0, so reject non-numeric input first.
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { error: 'band phải là một số' };
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return { error: 'band phải là một số' };
  }

  if (parsed < BAND_MIN || parsed > BAND_MAX) {
    return { error: `band phải nằm trong khoảng ${BAND_MIN}–${BAND_MAX}` };
  }

  if (!Number.isInteger(parsed * 2)) {
    return { error: 'band chỉ nhận các mức 0.5 (ví dụ 6.0, 6.5, 7.0)' };
  }

  return { band: parsed };
}

export function parseBandOrThrow(value, { required = false } = {}) {
  const result = parseBand(value);

  if (result.error) {
    throw new Error(result.error);
  }

  if (result.omitted) {
    if (required) {
      throw new Error('band là bắt buộc');
    }
    return null;
  }

  return result.band;
}
