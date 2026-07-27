import 'dotenv/config';
import pool from '../config/db.js';

// Clears every person-related row so the app can restart on real Google
// accounts, while KEEPING the question bank (topics + questions), which is
// authored content rather than test data. Deletion order follows foreign keys.
const DELETE_ORDER = [
  'refresh_tokens',
  'user_identities',
  'mentor_applications',
  'notifications',
  'classroom_post_likes',
  'classroom_post_saves',
  'classroom_comments',
  'classroom_posts',
  'mentor_reviews',
  'session_ai_results',
  'ai_results',
  'peer_notes',
  'turns',
  'mentor_session_applicants',
  'mentor_sessions',
  'sessions',
];

async function wipe() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const table of DELETE_ORDER) {
      const result = await client.query(`DELETE FROM ${table}`);
      console.log(`  ${table}: xoá ${result.rowCount} dòng`);
    }

    // Mentor-owned question sets belong to users being removed; hand them back
    // to the system scope instead of deleting the questions inside them.
    const releasedTopics = await client.query(
      `
        UPDATE topics
        SET owner_id = NULL, scope = 'system'
        WHERE owner_id IS NOT NULL
      `
    );
    console.log(`  topics (chuyển về hệ thống): ${releasedTopics.rowCount} dòng`);

    const users = await client.query('DELETE FROM users');
    console.log(`  users: xoá ${users.rowCount} dòng`);

    await client.query('COMMIT');
    console.log('Đã xoá sạch dữ liệu người dùng. Bộ câu hỏi được giữ nguyên.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

wipe().catch((err) => {
  console.error('Xoá dữ liệu thất bại:', err.message);
  process.exit(1);
});
