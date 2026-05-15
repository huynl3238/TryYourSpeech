const REQUIRED_AI_CONFIG = [
  'OPENAI_API_KEY',
  'AZURE_SPEECH_KEY',
  'AZURE_SPEECH_REGION',
  'GEMINI_API_KEY',
];

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

async function markSessionCompletedIfAllResultsTerminal(client, sessionId) {
  await client.query(
    `
      UPDATE sessions
      SET status = 'completed',
          ended_at = NOW()
      WHERE id = $1
        AND status = 'processing'
        AND NOT EXISTS (
          SELECT 1
          FROM turns tr
          JOIN ai_results ar ON ar.turn_id = tr.id
          WHERE tr.session_id = $1
            AND ar.status NOT IN ('completed', 'failed')
        )
    `,
    [sessionId]
  );
}

async function failSessionBecauseAiConfigMissing(client, sessionId, missingConfigNames) {
  const errorMessage = getMissingConfigError(missingConfigNames);

  await markProcessingResultsFailed(client, sessionId, errorMessage);
  await markSessionCompletedIfAllResultsTerminal(client, sessionId);

  console.warn(`${errorMessage}. Session ${sessionId} was completed with failed AI results.`);

  return {
    started: false,
    status: 'failed',
    reason: errorMessage,
  };
}

export async function prepareAiPipeline(client, sessionId) {
  const missingConfigNames = getMissingAiConfigNames();

  if (missingConfigNames.length > 0) {
    return failSessionBecauseAiConfigMissing(client, sessionId, missingConfigNames);
  }

  console.log(`AI pipeline is ready for session ${sessionId}`);
  return { started: false, status: 'processing', reason: 'AI worker is not implemented yet' };
}
