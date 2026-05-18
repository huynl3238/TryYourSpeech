const REQUIRED_AI_CONFIG = [
  'OPENAI_API_KEY',
  'AZURE_SPEECH_KEY',
  'AZURE_SPEECH_REGION',
];

const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const DEFAULT_OPENAI_FEEDBACK_MODEL = 'gpt-4.1-mini';
const DEFAULT_AZURE_SPEECH_LANGUAGE = 'en-US';

function hasEnvValue(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0;
}

export function getMissingAiConfigNames() {
  return REQUIRED_AI_CONFIG.filter((name) => !hasEnvValue(name));
}

export function getAiRuntimeConfig() {
  return {
    openAiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_OPENAI_TRANSCRIPTION_MODEL,
    openAiFeedbackModel: process.env.OPENAI_FEEDBACK_MODEL || DEFAULT_OPENAI_FEEDBACK_MODEL,
    azureSpeechLanguage: process.env.AZURE_SPEECH_LANGUAGE || DEFAULT_AZURE_SPEECH_LANGUAGE,
  };
}

export function getAiConfigStatus() {
  const missing = getMissingAiConfigNames();

  return {
    ok: missing.length === 0,
    provider: {
      transcription: 'openai',
      pronunciation: 'azure',
      feedback: 'openai',
    },
    configured: REQUIRED_AI_CONFIG.filter((name) => !missing.includes(name)),
    missing,
    runtime: getAiRuntimeConfig(),
  };
}
