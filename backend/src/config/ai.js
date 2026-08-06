const REQUIRED_AI_CONFIG = [
  'OPENAI_API_KEY',
  'AZURE_SPEECH_KEY',
  'AZURE_SPEECH_REGION',
];

const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const DEFAULT_OPENAI_FEEDBACK_MODEL = 'gpt-4.1-mini';
const DEFAULT_AZURE_SPEECH_LANGUAGE = 'en-US';
// Hard monthly cap on how many turns the AI pipeline may assess, so the paid
// OpenAI + Azure usage can never silently exceed the budget. 0 or a negative
// value disables the cap.
//
// The unit is TURNS, not sessions, and the two are an order of magnitude apart:
// a full test is roughly six turns per speaker, so 250 turns is only about 40
// sessions. Anyone reading this number as "40 tests a month" rather than "250"
// is the mistake to guard against — raise it deliberately before a demo day
// instead of discovering the cap mid-session.
const DEFAULT_MONTHLY_ASSESSMENT_LIMIT = 250;

function hasEnvValue(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0;
}

function getMonthlyAssessmentLimit() {
  const raw = process.env.AI_MONTHLY_ASSESSMENT_LIMIT;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return DEFAULT_MONTHLY_ASSESSMENT_LIMIT;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MONTHLY_ASSESSMENT_LIMIT;
  }

  return Math.trunc(parsed);
}

export function getMissingAiConfigNames() {
  return REQUIRED_AI_CONFIG.filter((name) => !hasEnvValue(name));
}

export function getAiRuntimeConfig() {
  return {
    openAiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_OPENAI_TRANSCRIPTION_MODEL,
    openAiFeedbackModel: process.env.OPENAI_FEEDBACK_MODEL || DEFAULT_OPENAI_FEEDBACK_MODEL,
    azureSpeechLanguage: process.env.AZURE_SPEECH_LANGUAGE || DEFAULT_AZURE_SPEECH_LANGUAGE,
    monthlyAssessmentLimit: getMonthlyAssessmentLimit(),
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
