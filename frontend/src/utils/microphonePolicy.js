export function canEnableMicrophoneDuringSession({
  practiceStarted,
  turns,
  currentTurnIndex,
  role,
}) {
  if (!practiceStarted) {
    return true;
  }

  const currentTurn = turns?.[currentTurnIndex];
  return currentTurn?.speakerRole === role;
}
