// Chup man hinh CHI TIET BAI LOP HOC, di dung duong nguoi dung: mo tab Lop hoc,
// bam vao bai, xem khoi "Nhan xet tu AI".
//
// Dung ket qua AI THAT do duoc truoc day (ai-result2.json) de khoi phai goi lai
// API tra phi. Chup hai truong hop, vi day chinh la cho tung hien so bia:
//   1. Phien DA cham xong  -> phai hien dung 3 tieu chi that
//   2. Phien CHUA cham     -> phai noi thang la chua co, khong hien so nao
//
// Chay tu e2e/: node shot-classroom.mjs <file-ai-result.json> <thu-muc-anh>
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_URL, launchBrowser, openAs, pool } from './helpers/harness.js';
import jwt from 'jsonwebtoken';

const [resultPath, outDir] = process.argv.slice(2);
if (!resultPath || !outDir) {
  console.error('Dung: node shot-classroom.mjs <ai-result.json> <thu-muc-anh>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const saved = JSON.parse(readFileSync(resultPath, 'utf8'));
const oldFeedback = saved.holistic.feedback;
// Bo field `band` trong pronunciation: ket qua nay do TRUOC khi bo phat am khoi
// band, de nguyen thi anh chup lai la giao dien cu.
const { band: _drop, ...rawPronunciation } = oldFeedback.pronunciation || {};
const feedback = { ...oldFeedback, pronunciation: rawPronunciation };
const scores = {
  fluency: saved.holistic.scores.fluency,
  lexical: saved.holistic.scores.lexical,
  grammar: saved.holistic.scores.grammar,
};
const overallBand = Math.round(((scores.fluency + scores.lexical + scores.grammar) / 3) * 2) / 2;

const created = { userIds: [], sessionIds: [], topicIds: [], questionIds: [] };

async function seed({ withAi }) {
  const stamp = randomUUID().slice(0, 8);
  const authorId = randomUUID();
  const peerId = randomUUID();
  const topicId = randomUUID();
  const questionId = randomUUID();
  const sessionId = randomUUID();
  const turnId = randomUUID();
  const postId = randomUUID();
  created.userIds.push(authorId, peerId);
  created.sessionIds.push(sessionId);
  created.topicIds.push(topicId);
  created.questionIds.push(questionId);

  await pool.query(
    `INSERT INTO users (id, display_name, band, user_role) VALUES
       ($1, $3, 6, 'student'), ($2, $4, 6.5, 'student')`,
    [authorId, peerId, `Huy ${stamp}`, `Tra My ${stamp}`]
  );
  await pool.query(`INSERT INTO topics (id, name, status) VALUES ($1, $2, 'open')`, [
    topicId,
    withAi ? 'People who inspire you' : 'Education and technology',
  ]);
  await pool.query(
    `INSERT INTO questions (id, topic_id, part_number, question_text) VALUES ($1, $2, 2, $3)`,
    [questionId, topicId, saved.turnResults[1]?.questionText || 'Describe a person you admire.']
  );
  await pool.query(
    `INSERT INTO sessions (id, room_id, user_a_id, user_b_id, topic_id, session_mode, status,
       started_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, 'peer', 'completed',
       NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '5 minutes')`,
    [sessionId, `room-${stamp}`, authorId, peerId, topicId]
  );
  await pool.query(
    `INSERT INTO turns (id, session_id, speaker_id, speaker_role, question_id, part_number,
       turn_index, duration_ms, prep_duration_ms, upload_status)
     VALUES ($1, $2, $3, 'A', $4, 2, 1, 123000, 60000, 'uploaded')`,
    [turnId, sessionId, authorId, questionId]
  );
  await pool.query(
    `INSERT INTO ai_results (id, turn_id, status, whisper_transcript) VALUES ($1, $2, $3, $4)`,
    [
      randomUUID(),
      turnId,
      withAi ? 'completed' : 'processing',
      withAi ? saved.turnResults[1]?.transcript || '' : null,
    ]
  );

  if (withAi) {
    await pool.query(
      `INSERT INTO session_ai_results (id, session_id, user_id, status, fluency_score,
         lexical_score, grammar_score, pronunciation_score, overall_band, holistic_feedback)
       VALUES ($1, $2, $3, 'completed', $4, $5, $6, NULL, $7, $8)`,
      [
        randomUUID(),
        sessionId,
        authorId,
        scores.fluency,
        scores.lexical,
        scores.grammar,
        overallBand,
        JSON.stringify(feedback),
      ]
    );
  }

  await pool.query(
    `INSERT INTO classroom_posts (id, session_id, author_id, title, description, status)
     VALUES ($1, $2, $3, $4, $5, 'published')`,
    [
      postId,
      sessionId,
      authorId,
      withAi ? 'Part 2 - Nguoi truyen cam hung' : 'Part 2 - Cong nghe va hoc tap',
      withAi
        ? 'Bai noi da co ket qua cham AI day du.'
        : 'Bai noi chua duoc cham AI, chi co ghi chu peer.',
    ]
  );

  const token = jwt.sign({ sub: authorId, role: 'student' }, process.env.JWT_SECRET, {
    expiresIn: '2h',
  });

  return { authorId, token, postTitle: withAi ? 'Nguoi truyen cam hung' : 'Cong nghe va hoc tap' };
}

async function cleanup() {
  for (const sessionId of created.sessionIds) {
    await pool.query('DELETE FROM classroom_posts WHERE session_id = $1', [sessionId]);
    await pool.query(
      'DELETE FROM ai_results WHERE turn_id IN (SELECT id FROM turns WHERE session_id = $1)',
      [sessionId]
    );
    await pool.query('DELETE FROM session_ai_results WHERE session_id = $1', [sessionId]);
    await pool.query('DELETE FROM turns WHERE session_id = $1', [sessionId]);
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }
  await pool.query('DELETE FROM questions WHERE id = ANY($1)', [created.questionIds]);
  await pool.query('DELETE FROM topics WHERE id = ANY($1)', [created.topicIds]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [created.userIds]);
}

const browser = await launchBrowser();

try {
  const withAi = await seed({ withAi: true });
  const withoutAi = await seed({ withAi: false });

  for (const [name, who] of [['1-da-cham-ai', withAi], ['2-chua-cham-ai', withoutAi]]) {
    const person = await openAs(browser, { id: who.authorId, token: who.token });
    await person.page.setViewportSize({ width: 1280, height: 1000 });
    await person.page.goto(APP_URL);
    await person.page.waitForSelector('#find-partner-btn', { timeout: 30000 });
    await person.page.getByRole('button', { name: /Lớp học/ }).first().click();

    const card = person.page.locator('article', { hasText: who.postTitle }).first();
    await card.waitFor({ timeout: 20000 });
    await card.getByRole('button', { name: /Xem chi tiết/ }).click();

    await person.page.waitForSelector('text=Quay lại lớp học', { timeout: 20000 });

    // Trang cuon ben trong `.app-main`, khong phai cuon ca tai lieu, nen fullPage
    // chi bat duoc phan dau. Chup thang the chua khoi AI.
    const aiCard = person.page
      .locator('div.shadow-sm')
      .filter({ hasText: 'Nhận xét từ AI' })
      .last();
    await aiCard.scrollIntoViewIfNeeded();
    await person.page.waitForTimeout(1200);

    const path = join(outDir, `${name}.png`);
    await aiCard.screenshot({ path });
    console.log('da chup:', path);
    await person.context.close();
  }
} catch (err) {
  console.error('LOI:', err.message);
} finally {
  await browser.close();
  await cleanup();
  await pool.end();
}
