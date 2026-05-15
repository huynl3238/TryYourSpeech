const REQUIRED_AI_CONFIG = [
  'OPENAI_API_KEY',
  'AZURE_SPEECH_KEY',
  'AZURE_SPEECH_REGION',
  'GEMINI_API_KEY',
];
const AI_WORKER_NOT_IMPLEMENTED_ERROR = 'AI worker is not implemented yet';

function getMissingAiConfigNames() {
  return REQUIRED_AI_CONFIG.filter((name) => !process.env[name]);
}

function getMissingConfigError(missingConfigNames) {
  return `AI services are not configured. Missing: ${missingConfigNames.join(', ')}`;
}

async function markProcessingResultsFailed(client, sessionId, errorMessage) {
  await client.query(
    `
      UPDATE ai_results
      SET status = 'failed',
          error_message = $2,
          updated_at = NOW()
      WHERE status = 'processing'
        AND turn_id IN (
          SELECT id
          FROM turns
          WHERE session_id = $1
        )
    `,
    [sessionId, errorMessage]
  );
}

async function failSessionProcessing(client, sessionId, errorMessage) {
  await markProcessingResultsFailed(client, sessionId, errorMessage);

  return {
    started: false,
    status: 'failed',
    reason: errorMessage,
  };
}

async function failSessionBecauseAiConfigMissing(client, sessionId, missingConfigNames) {
  const errorMessage = getMissingConfigError(missingConfigNames);
  const result = await failSessionProcessing(client, sessionId, errorMessage);

  console.warn(`${errorMessage}. Session ${sessionId} was completed with failed AI results.`);

  return result;
}

async function failSessionBecauseWorkerIsMissing(client, sessionId) {
  const result = await failSessionProcessing(client, sessionId, AI_WORKER_NOT_IMPLEMENTED_ERROR);

  console.warn(`Session ${sessionId} was completed because the AI worker is not implemented yet.`);

  return result;
}

export async function prepareAiPipeline(client, sessionId) {
  const missingConfigNames = getMissingAiConfigNames();

  if (missingConfigNames.length > 0) {
    return failSessionBecauseAiConfigMissing(client, sessionId, missingConfigNames);
  }

  return failSessionBecauseWorkerIsMissing(client, sessionId);
}
