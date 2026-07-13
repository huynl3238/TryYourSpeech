import 'dotenv/config';
import pool from '../config/db.js';

const resetSql = `
  DROP TABLE IF EXISTS mentor_session_applicants;
  DROP TABLE IF EXISTS mentor_sessions;
  DROP TABLE IF EXISTS notifications;
  DROP TABLE IF EXISTS classroom_post_saves;
  DROP TABLE IF EXISTS classroom_post_likes;
  DROP TABLE IF EXISTS classroom_comments;
  DROP TABLE IF EXISTS classroom_posts;
  DROP TABLE IF EXISTS mentor_reviews;
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
