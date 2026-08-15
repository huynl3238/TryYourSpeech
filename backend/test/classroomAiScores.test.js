import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
import { getClassroomPost } from '../src/models/classroomModel.js';

// Trang chi tiết Lớp học từng hiện điểm AI VIẾT CỨNG trong frontend
// (`post.id === 1 ? '6.5' : '7.0'`, kèm cả tiêu chí Pronunciation). Nó tồn tại vì
// API không có đường nào trả về điểm từng tiêu chí. Mấy bài dưới đây khoá lại cái
// đường đó: điểm phải tới từ bảng `session_ai_results`, và khi chưa chấm xong thì
// API phải nói rõ là chưa có để giao diện không hiện số nào.

async function canUseDatabase() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Một bài đã public, kèm đúng một lượt nói. `holistic` = null nghĩa là phiên chưa
// có kết quả chấm cả bài.
async function seedPost({ holistic = null, turnScores = null } = {}) {
  const authorId = randomUUID();
  const peerId = randomUUID();
  const topicId = randomUUID();
  const questionId = randomUUID();
  const sessionId = randomUUID();
  const turnId = randomUUID();
  const postId = randomUUID();

  await pool.query(
    `INSERT INTO users (id, display_name, band, user_role) VALUES
       ($1, 'Tac gia test', 6, 'student'),
       ($2, 'Nguoi cung luyen test', 6.5, 'student')`,
    [authorId, peerId]
  );
  await pool.query(`INSERT INTO topics (id, name, status) VALUES ($1, $2, 'open')`, [
    topicId,
    `Topic test ${topicId.slice(0, 8)}`,
  ]);
  await pool.query(
    `INSERT INTO questions (id, topic_id, part_number, question_text)
     VALUES ($1, $2, 2, 'Describe a place you like.')`,
    [questionId, topicId]
  );
  await pool.query(
    `INSERT INTO sessions (id, room_id, user_a_id, user_b_id, topic_id, session_mode, status)
     VALUES ($1, $2, $3, $4, $5, 'peer', 'completed')`,
    [sessionId, `room-${sessionId.slice(0, 8)}`, authorId, peerId, topicId]
  );
  await pool.query(
    `INSERT INTO turns (id, session_id, speaker_id, speaker_role, question_id, part_number,
       turn_index, duration_ms, prep_duration_ms, upload_status, audio_url)
     VALUES ($1, $2, $3, 'A', $4, 2, 1, 120000, 60000, 'uploaded', $5)`,
    [turnId, sessionId, authorId, questionId, `/uploads/audio/${turnId}.webm`]
  );

  if (turnScores) {
    await pool.query(
      `INSERT INTO ai_results (id, turn_id, status, whisper_transcript,
         fluency_score, lexical_score, grammar_score, pronunciation_score)
       VALUES ($1, $2, 'completed', 'I really like that place.', $3, $4, $5, $6)`,
      [
        randomUUID(),
        turnId,
        turnScores.fluency,
        turnScores.lexical,
        turnScores.grammar,
        turnScores.pronunciation,
      ]
    );
  }

  if (holistic) {
    await pool.query(
      `INSERT INTO session_ai_results (id, session_id, user_id, status, fluency_score,
         lexical_score, grammar_score, pronunciation_score, overall_band, holistic_feedback)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9)`,
      [
        randomUUID(),
        sessionId,
        authorId,
        holistic.status,
        holistic.fluency,
        holistic.lexical,
        holistic.grammar,
        holistic.overallBand,
        holistic.feedback ? JSON.stringify(holistic.feedback) : null,
      ]
    );
  }

  await pool.query(
    `INSERT INTO classroom_posts (id, session_id, author_id, title, status)
     VALUES ($1, $2, $3, 'Bai test lop hoc', 'published')`,
    [postId, sessionId, authorId]
  );

  return { postId, sessionId, authorId, peerId, topicId, questionId, turnId };
}

async function cleanup(seeded) {
  if (!seeded) return;
  const { sessionId, authorId, peerId, topicId, questionId } = seeded;

  await pool.query('DELETE FROM classroom_posts WHERE session_id = $1', [sessionId]);
  await pool.query(
    'DELETE FROM ai_results WHERE turn_id IN (SELECT id FROM turns WHERE session_id = $1)',
    [sessionId]
  );
  await pool.query('DELETE FROM session_ai_results WHERE session_id = $1', [sessionId]);
  await pool.query('DELETE FROM turns WHERE session_id = $1', [sessionId]);
  await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  await pool.query('DELETE FROM questions WHERE id = $1', [questionId]);
  await pool.query('DELETE FROM topics WHERE id = $1', [topicId]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [authorId, peerId]);
}

test('bài Lớp học trả về điểm 3 tiêu chí THẬT từ session_ai_results', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let seeded = null;
  try {
    seeded = await seedPost({
      holistic: {
        status: 'completed',
        fluency: 7,
        lexical: 6.5,
        grammar: 6,
        overallBand: 6.5,
        feedback: {
          overall: { summary: 'Bai noi mach lac.', strengths: ['Y ro'], improvements: ['Them vi du'] },
          criteria: {
            fluencyCoherence: { band: 7, feedback: 'Noi troi chay.', evidence: 'well, I think' },
            lexicalResource: { band: 6.5, feedback: 'Tu vung du dung.' },
            grammaticalRangeAccuracy: { band: 6, feedback: 'Con loi mao tu.' },
          },
        },
      },
    });

    const { post } = await getClassroomPost(seeded.postId, { userId: seeded.authorId });

    assert.equal(post.ai.status, 'completed');
    assert.equal(post.ai.overallBand, 6.5);
    // Đúng ba tiêu chí ngôn ngữ, và đúng con số đã lưu — không phải số nào khác.
    assert.deepEqual(post.ai.scores, { fluency: 7, lexical: 6.5, grammar: 6 });

    // Nhận xét từng tiêu chí phải đi kèm, nếu không giao diện lại không có gì thật
    // để hiện và người sau lại viết cứng vào code.
    assert.equal(post.ai.feedback.criteria.fluencyCoherence.feedback, 'Noi troi chay.');
    assert.equal(post.ai.feedback.criteria.grammaticalRangeAccuracy.band, 6);
    assert.equal(post.ai.feedback.overall.summary, 'Bai noi mach lac.');

    // Phát âm KHÔNG được có band riêng trong khối 3 tiêu chí.
    assert.equal(post.ai.scores.pronunciation, undefined);
  } finally {
    await cleanup(seeded);
  }
});

test('phiên chưa chấm AI thì báo rõ là chưa có, không trả điểm nào', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let seeded = null;
  try {
    seeded = await seedPost();

    const { post } = await getClassroomPost(seeded.postId, { userId: seeded.authorId });

    // Giao diện dựa vào đúng ba thứ này để quyết định không hiện con số nào.
    assert.equal(post.ai.status, null);
    assert.equal(post.ai.overallBand, null);
    assert.deepEqual(post.ai.scores, { fluency: null, lexical: null, grammar: null });
    assert.equal(post.ai.feedback, null);

    const turn = post.aiTranscripts[0];
    assert.equal(turn.audioUrl, `/api/turns/${seeded.turnId}/audio`);
    assert.equal(turn.durationMs, 120000);
    assert.equal(turn.speakerId, seeded.authorId);
    assert.equal(turn.transcript, '');
    assert.deepEqual(turn.words, []);
    assert.equal(turn.transcriptStatus, 'processing');
  } finally {
    await cleanup(seeded);
  }
});

test('AI chấm lỗi thì trạng thái là failed, không phải im lặng như chưa chấm', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let seeded = null;
  try {
    seeded = await seedPost({
      holistic: { status: 'failed', fluency: null, lexical: null, grammar: null, overallBand: null },
    });

    const { post } = await getClassroomPost(seeded.postId, { userId: seeded.authorId });

    assert.equal(post.ai.status, 'failed');
    assert.equal(post.ai.overallBand, null);
  } finally {
    await cleanup(seeded);
  }
});

test('điểm tổng của một lượt nói không được cộng phát âm vào', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  let seeded = null;
  try {
    // Phát âm 4.0 lệch hẳn khỏi ba tiêu chí 7.0: trung bình ba là 7.0, trung bình
    // cả bốn là 6.5. Nên con số trả về nói rõ phát âm có bị kéo vào hay không.
    seeded = await seedPost({
      turnScores: { fluency: 7, lexical: 7, grammar: 7, pronunciation: 4 },
    });

    const { post } = await getClassroomPost(seeded.postId, { userId: seeded.authorId });
    const turn = post.aiTranscripts[0];

    assert.equal(turn.scores.overall, 7, 'phát âm đã bị cộng vào điểm tổng của lượt nói');
    assert.equal(turn.transcriptStatus, 'ready');
    // Điểm phát âm thô vẫn giữ để hiển thị riêng, chỉ không được vào điểm tổng.
    assert.equal(turn.scores.pronunciation, 4);
  } finally {
    await cleanup(seeded);
  }
});
