export function isTerminalAiStatus(status) {
  return status === 'completed' || status === 'failed';
}

export function areAiResultsTerminal(results) {
  const turnResults = results?.turnResults || [];
  if (turnResults.length === 0 || !turnResults.every((turn) => isTerminalAiStatus(turn.aiStatus))) {
    return false;
  }

  if (results?.sessionMode === 'mentor') {
    return true;
  }

  return isTerminalAiStatus(results?.holistic?.status);
}
