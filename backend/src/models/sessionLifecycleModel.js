export async function markSessionCompletedIfAllResultsTerminal(client, sessionId) {
  const result = await client.query(
    `
      UPDATE sessions
      SET status = 'completed',
          ended_at = COALESCE(ended_at, NOW())
      WHERE id = $1
        AND status = 'processing'
        AND NOT EXISTS (
          SELECT 1
          FROM turns tr
          LEFT JOIN ai_results ar ON ar.turn_id = tr.id
          WHERE tr.session_id = $1
            AND (
              ar.id IS NULL OR
              ar.status NOT IN ('completed', 'failed')
            )
        )
      RETURNING status
    `,
    [sessionId]
  );

  return result.rows[0]?.status || null;
}

export async function getSessionStatus(client, sessionId) {
  const result = await client.query(
    `
      SELECT status
      FROM sessions
      WHERE id = $1
    `,
    [sessionId]
  );

  return result.rows[0]?.status || null;
}
