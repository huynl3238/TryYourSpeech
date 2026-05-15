function hasRequiredAiConfig() {
  return Boolean(
    process.env.OPENAI_API_KEY &&
    process.env.AZURE_SPEECH_KEY &&
    process.env.AZURE_SPEECH_REGION &&
    process.env.GEMINI_API_KEY
  );
}

export function prepareAiPipeline(sessionId) {
  if (!hasRequiredAiConfig()) {
    console.warn(`AI services are not configured. Session ${sessionId} will stay in processing state.`);
    return { started: false, reason: 'AI services are not configured' };
  }

  console.log(`AI pipeline is ready for session ${sessionId}`);
  return { started: false, reason: 'AI worker is not implemented yet' };
}
