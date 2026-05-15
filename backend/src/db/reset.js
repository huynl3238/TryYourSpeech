import 'dotenv/config';
import pool from '../config/db.js';

const resetSql = `
  DROP TABLE IF EXISTS ai_results;
  DROP TABLE IF EXISTS peer_notes;
  DROP TABLE IF EXISTS turns;
  DROP TABLE IF EXISTS sessions;
  DROP TABLE IF EXISTS questions;
  DROP TABLE IF EXISTS topics;
  DROP TABLE IF EXISTS users;
`;

async function resetDatabase() {
  try {
    await pool.query(resetSql);
    console.log('Database reset completed');
  } finally {
    await pool.end();
  }
}

resetDatabase().catch((err) => {
  console.error('Database reset failed:', err.message);
  process.exit(1);
});
