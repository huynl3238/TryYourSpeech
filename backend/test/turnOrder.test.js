import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pool from '../src/config/db.js';
import { createMatchedSession, getSessionDetail } from '../src/models/sessionModel.js';

// Thứ tự lượt nói là bố cục của cả buổi luyện, và nó chỉ được quyết đúng một
// lần — lúc tạo phiên. Sai ở đây thì không có chỗ nào sửa lại được: bảng `turns`
// đã ghi, hai máy đọc theo đó, và bài ghi âm gắn với từng dòng.
//
// Hai điều bộ test này giữ:
//   1. Mỗi người nói hết cả part rồi mới đổi lượt (không đổi sau từng câu).
//   2. Người mở màn luân phiên theo part — vì người nói sau luôn được nghe đáp
//      án của người trước, mà chia khối làm lợi thế đó to hẳn lên.

async function canUseDatabase() {
  try {
    await pool.query('SELECT id FROM sessions LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

async function createUser() {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, display_name, band, user_role) VALUES ($1, $2, 6, 'student')`,
    [id, `Order ${id.slice(0, 8)}`]
  );
  return { id, userId: id, displayName: `Order ${id.slice(0, 8)}`, band: 6, userRole: 'student' };
}

async function deleteUsers(userIds) {
  await pool.query(
    `DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1))`,
    [userIds]
  );
  await pool.query(`DELETE FROM sessions WHERE user_a_id = ANY($1) OR user_b_id = ANY($1)`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
}

// Chuỗi vai theo đúng thứ tự lượt, ví dụ 'AAAABBBB' — đọc một phát là thấy
// ngay bố cục, và một sai lệch nhỏ cũng lộ ra thành chuỗi khác hẳn.
function roleSequence(turns, partNumber) {
  return turns
    .filter((turn) => turn.partNumber === partNumber)
    .map((turn) => turn.speakerRole)
    .join('');
}

async function createFullSession() {
  const userA = await createUser();
  const userB = await createUser();
  const session = await createMatchedSession(`order-${randomUUID()}`, userA, userB, 'peer', 'full');
  const detail = await getSessionDetail(session.sessionId || session.id);

  return { detail, userIds: [userA.id, userB.id] };
}

test('mỗi người nói hết cả part rồi mới đổi lượt', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { detail, userIds } = await createFullSession();

  try {
    // Trước đây là 'ABABABAB': đổi lượt sau từng câu, nên Part 1 mất hẳn mạch
    // hội thoại và người đánh dấu lỗi phải đổi vai cứ 45 giây một lần.
    assert.equal(roleSequence(detail.turns, 1), 'AAAABBBB', 'Part 1: 4 câu liền của A rồi 4 câu của B');
    assert.equal(roleSequence(detail.turns, 3), 'AAABBB', 'Part 3: 3 câu liền mỗi người');
  } finally {
    await deleteUsers(userIds);
  }
});

test('người mở màn luân phiên qua từng part', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { detail, userIds } = await createFullSession();

  try {
    // A mở Part 1, B mở Part 2, A mở Part 3. Trước đây A nói trước ở cả 8 câu,
    // nên B luôn được nghe đáp án trước khi tới lượt mình.
    assert.equal(roleSequence(detail.turns, 1).startsWith('A'), true, 'Part 1 mở bằng A');
    assert.equal(roleSequence(detail.turns, 2), 'BA', 'Part 2 đảo lại, mở bằng B');
    assert.equal(roleSequence(detail.turns, 3).startsWith('A'), true, 'Part 3 mở bằng A');
  } finally {
    await deleteUsers(userIds);
  }
});

test('không câu nào bị mất hay bị nói hai lần bởi cùng một người', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { detail, userIds } = await createFullSession();

  try {
    // Đổi thứ tự lượt là chỗ rất dễ làm rơi hoặc nhân đôi một câu mà nhìn bố
    // cục vẫn thấy hợp lý.
    assert.equal(detail.turns.length, 16, '8 câu × 2 người');

    const seen = new Set();
    for (const turn of detail.turns) {
      const key = `${turn.questionId}:${turn.speakerRole}`;
      assert.equal(seen.has(key), false, `câu ${turn.questionId} bị lặp cho cùng một người`);
      seen.add(key);
    }

    const questionIds = new Set(detail.turns.map((turn) => turn.questionId));
    assert.equal(questionIds.size, 8, 'phải đủ 8 câu khác nhau');
  } finally {
    await deleteUsers(userIds);
  }
});

test('thứ tự lượt tăng liên tục, không có lỗ hổng', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('Bỏ qua: cần Postgres đã chạy npm run db:migrate');
    return;
  }

  const { detail, userIds } = await createFullSession();

  try {
    // Đồng hồ của phiên duyệt mảng này theo đúng thứ tự. Một lỗ hổng ở đây
    // không báo lỗi gì cả — nó chỉ làm hai máy tính ra hai mốc khác nhau.
    const indexes = detail.turns.map((turn) => turn.turnIndex);
    assert.deepEqual(indexes, Array.from({ length: 16 }, (_, i) => i + 1));

    const partNumbers = [...new Set(detail.turns.map((turn) => turn.partNumber))];
    assert.deepEqual(partNumbers, [1, 2, 3], 'các part phải đi liền khối theo đúng thứ tự');
  } finally {
    await deleteUsers(userIds);
  }
});
