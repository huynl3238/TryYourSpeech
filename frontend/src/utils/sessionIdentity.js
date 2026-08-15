function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function resolveSessionId({ sessionId, sessionData, results } = {}) {
  return asNonEmptyString(results?.sessionId)
    || asNonEmptyString(sessionData?.session?.id)
    || asNonEmptyString(sessionId);
}
