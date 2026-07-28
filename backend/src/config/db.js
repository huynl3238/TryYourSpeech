import pg from 'pg';

function getDbPort() {
  return Number.parseInt(process.env.DB_PORT || '5432', 10);
}

function getErrorMessage(err) {
  if (err.message) {
    return err.message;
  }

  if (Array.isArray(err.errors) && err.errors.length > 0) {
    return err.errors.map((error) => error.message).join('; ');
  }

  return 'Unknown PostgreSQL error';
}

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: getDbPort(),
  database: process.env.DB_NAME || 'ielts_speaking',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  connectionTimeoutMillis: 2000,
  // Idle pooled connections otherwise keep the event loop alive for their full
  // idle timeout, which made every test file that touches the database hang for
  // ten seconds after finishing. The server itself is kept alive by its HTTP
  // listener, so nothing changes in production.
  allowExitOnIdle: true,
});

export async function checkDbConnection() {
  let client;

  try {
    client = await pool.connect();
    await client.query('SELECT 1');

    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function testDbConnection() {
  const result = await checkDbConnection();

  if (result.ok) {
    console.log('PostgreSQL connected');
    return;
  }

  console.warn('PostgreSQL not available:', result.error);
}

export default pool;
