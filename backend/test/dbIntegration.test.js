import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pool from '../src/config/db.js';
import {
  createMatchedSession,
  getSessionDetail,
  markSessionActive,
} from '../src/models/sessionModel.js';
import { completeReview, savePeerNotesBatch } from '../src/models/reviewModel.js';
import { getResultsForUser } from '../src/models/resultsModel.js';
import { saveMentorReview } from '../src/models/mentorReviewModel.js';
import { getPracticeHistoryForUser } from '../src/models/practiceHistoryModel.js';
import { getUserProfile, updateUserProfile } from '../src/models/userProfileModel.js';
import {
  createQuestion,
  createTopic,
  deleteQuestion,
  deleteTopic,
  getTopicDetail,
  listTopics,
  updateQuestion,
  updateTopic,
} from '../src/models/topicModel.js';
import {
  addClassroomComment,
  approveClassroomPost,
  getClassroomPost,
  listClassroomPosts,
  publishClassroomPost,
  toggleClassroomLike,
  toggleClassroomSave,
} from '../src/models/classroomModel.js';
import { listStudentWork } from '../src/models/studentWorkModel.js';
import {
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../src/models/notificationModel.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dbDir = join(currentDir, '..', 'src', 'db');
const seedMentorId = '33333333-3333-4333-8333-333333333303';
const seedAdminId = '33333333-3333-4333-8333-333333333305';

async function canUseDatabase() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Re-applying the schema takes exclusive table locks. Test files therefore run
// one at a time (see the --test-concurrency=1 in the test script): in parallel,
// these ALTER TABLEs deadlock against ordinary queries in the other suites.
//
// Cached because every test in this file asks for it, and schema + seed is by
// far the slowest thing here — running it once instead of eight times.
let databaseReady = null;

async function prepareDatabase() {
  if (!databaseReady) {
    databaseReady = (async () => {
      const schemaSql = await readFile(join(dbDir, 'schema.sql'), 'utf8');
      const seedSql = await readFile(join(dbDir, 'seed.sql'), 'utf8');

      await pool.query(schemaSql);
      await pool.query(seedSql);
    })();
  }

  return databaseReady;
}

// Matchmaking no longer creates users — participants must be real accounts, so
// the test seeds them the way Google sign-in would.
async function createTestUser(displayName, band, userRole = 'student') {
  const result = await pool.query(
    `
      INSERT INTO users (id, display_name, band, user_role)
      VALUES (gen_random_uuid(), $1, $2, $3)
      RETURNING id
    `,
    [displayName, band, userRole]
  );

  return result.rows[0].id;
}

async function cleanupSession(session) {
  if (!session) {
    return;
  }

  await pool.query(
    `
      DELETE FROM notifications
      WHERE entity_id = $1
         OR recipient_id IN ($2, $3)
         OR actor_id IN ($2, $3)
    `,
    [session.sessionId, session.userA.id, session.userB.id]
  );
  await pool.query(
    `
      DELETE FROM classroom_comments
      WHERE post_id IN (
        SELECT id
        FROM classroom_posts
        WHERE session_id = $1
      )
    `,
    [session.sessionId]
  );
  await pool.query(
    `
      DELETE FROM classroom_post_likes
      WHERE post_id IN (
        SELECT id
        FROM classroom_posts
        WHERE session_id = $1
      )
    `,
    [session.sessionId]
  );
  await pool.query(
    `
      DELETE FROM classroom_post_saves
      WHERE post_id IN (
        SELECT id
        FROM classroom_posts
        WHERE session_id = $1
      )
    `,
    [session.sessionId]
  );
  await pool.query(
    `
      DELETE FROM classroom_posts
      WHERE session_id = $1
    `,
    [session.sessionId]
  );
  await pool.query(
    `
      DELETE FROM mentor_reviews
      WHERE session_id = $1
    `,
    [session.sessionId]
  );
  await pool.query(
    `
      DELETE FROM peer_notes
      WHERE turn_id IN (
        SELECT id
        FROM turns
        WHERE session_id = $1
      )
    `,
    [session.sessionId]
  );
  await pool.query(
    `
      DELETE FROM ai_results
      WHERE turn_id IN (
        SELECT id
        FROM turns
        WHERE session_id = $1
      )
    `,
    [session.sessionId]
  );
  await pool.query('DELETE FROM turns WHERE session_id = $1', [session.sessionId]);
  await pool.query('DELETE FROM sessions WHERE id = $1', [session.sessionId]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [
    session.userA.id,
    session.userB.id,
  ]);
}

test('database flow creates session, stores idempotent peer notes, and completes reviews', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('PostgreSQL local database is not available');
    return;
  }

  await prepareDatabase();

  let session = null;

  try {
    session = await createMatchedSession(
      'integration-test-room',
      { userId: await createTestUser('Integration A', 6.5), band: 6.5 },
      { userId: await createTestUser('Integration B', 6), band: 6 }
    );
    const detail = await getSessionDetail(session.sessionId);

    assert.equal(detail.session.status, 'matched');
    assert.equal(detail.participants.length, 2);
    // Đúng format IELTS Speaking thật: Part 1 bốn câu 45 giây, Part 2 một cue
    // card 2 phút có 1 phút chuẩn bị, Part 3 ba câu 60 giây. Mỗi câu cả hai
    // người đều trả lời nên số lượt gấp đôi số câu.
    assert.deepEqual(
      detail.turns.map((turn) => turn.partNumber),
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 3, 3, 3]
    );
    assert.deepEqual(
      detail.turns.map((turn) => turn.durationMs),
      [45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 120000, 120000, 60000, 60000, 60000, 60000, 60000, 60000]
    );
    // Chỉ Part 2 có thời gian chuẩn bị. Part 1 và Part 3 là hỏi rồi trả lời ngay.
    assert.deepEqual(
      detail.turns.map((turn) => turn.prepDurationMs),
      [0, 0, 0, 0, 0, 0, 0, 0, 60000, 60000, 0, 0, 0, 0, 0, 0]
    );
    // Mỗi người nói hết cả part rồi mới đổi lượt, và người mở màn đảo qua lại
    // giữa các part: A mở Part 1, B mở Part 2, A mở Part 3. Trước đây hai người
    // thay nhau theo từng câu ('ABABABAB') và A luôn là người nói trước.
    assert.deepEqual(
      detail.turns.map((turn) => turn.speakerRole),
      ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B', 'A', 'A', 'A', 'A', 'B', 'B', 'B']
    );

    await markSessionActive(session.sessionId);

    const speakerATurn = detail.turns.find((turn) => turn.speakerRole === 'A');
    const firstSave = await savePeerNotesBatch({
      sessionId: session.sessionId,
      listenerId: session.userB.id,
      notes: [{
        clientNoteId: 'integration-note-1',
        turnId: speakerATurn.id,
        timestampMs: 1200,
        errorType: 'pronunciation',
        noteText: 'Final sound is unclear',
      }],
    });
    const retrySave = await savePeerNotesBatch({
      sessionId: session.sessionId,
      listenerId: session.userB.id,
      notes: [{
        clientNoteId: 'integration-note-1',
        turnId: speakerATurn.id,
        timestampMs: 1200,
        errorType: 'pronunciation',
        noteText: 'Final sound is unclear',
      }],
    });

    assert.equal(firstSave.saved, 1);
    assert.equal(retrySave.saved, 0);

    const userAReview = await completeReview({
      sessionId: session.sessionId,
      userId: session.userA.id,
    });
    const userBReview = await completeReview({
      sessionId: session.sessionId,
      userId: session.userB.id,
    });
    const reviewedDetail = await getSessionDetail(session.sessionId);

    assert.equal(userAReview.bothCompleted, false);
    assert.equal(userBReview.bothCompleted, true);
    // No audio was uploaded in this flow, so review completion runs the pipeline
    // over zero turns and the session closes out right away instead of waiting.
    assert.equal(reviewedDetail.session.status, 'completed');

    const history = await getPracticeHistoryForUser({
      userId: session.userA.id,
    });
    const historySession = history.sessions.find((item) => item.id === session.sessionId);

    assert.equal(history.user.displayName, 'Integration A');
    assert.equal(historySession.sessionMode, 'peer');
    assert.equal(historySession.partner.displayName, 'Integration B');
    // 8 câu hỏi cho buổi đầy đủ, hai người trả lời hết -> 16 lượt, trong đó 8
    // lượt là của người đang xem lịch sử.
    assert.equal(historySession.turnCount, 16);
    assert.equal(historySession.speakingTurnCount, 8);
    assert.equal(historySession.notesReceivedCount, 1);
    assert.equal(historySession.notesGivenCount, 0);
    assert.equal(historySession.resultStatus, 'completed');

    const profile = await getUserProfile(session.userA.id);
    assert.equal(profile.user.displayName, 'Integration A');
    assert.equal(profile.stats.totalSessions >= 1, true);
    assert.equal(profile.stats.peerSessions >= 1, true);
    assert.equal(profile.stats.notesReceivedCount >= 1, true);

    const updatedProfile = await updateUserProfile({
      userId: session.userA.id,
      displayName: 'Updated Integration A',
      band: 7,
    });
    assert.equal(updatedProfile.user.displayName, 'Updated Integration A');
    assert.equal(updatedProfile.user.band, 7);
  } finally {
    await cleanupSession(session);
  }
});

test('mentor session creates student-only turns and completes with mentor review only', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('PostgreSQL local database is not available');
    return;
  }

  await prepareDatabase();

  let session = null;

  try {
    session = await createMatchedSession(
      'mentor-integration-test-room',
      { userId: await createTestUser('Student Integration', 5.5), band: 5.5 },
      { userId: await createTestUser('Mentor Integration', null, 'mentor'), band: null },
      'mentor'
    );
    const detail = await getSessionDetail(session.sessionId);

    assert.equal(detail.session.status, 'matched');
    assert.equal(detail.session.sessionMode, 'mentor');
    assert.deepEqual(
      detail.participants.map((participant) => participant.userRole),
      ['student', 'mentor']
    );
    // Phiên mentor: một lượt cho mỗi câu hỏi vì chỉ học viên nói, mentor nghe.
    assert.equal(detail.turns.length, 8);
    assert.ok(detail.turns.every((turn) => turn.speakerId === session.userA.id));
    assert.ok(detail.turns.every((turn) => turn.speakerRole === 'A'));

    await markSessionActive(session.sessionId);

    const speakerTurn = detail.turns[0];
    const notesResult = await savePeerNotesBatch({
      sessionId: session.sessionId,
      listenerId: session.userB.id,
      notes: [{
        clientNoteId: 'mentor-note-1',
        turnId: speakerTurn.id,
        timestampMs: 1500,
        errorType: 'grammar',
        noteText: 'Use past tense here',
      }],
    });

    assert.equal(notesResult.saved, 1);

    const mentorReview = await saveMentorReview({
      sessionId: session.sessionId,
      mentorId: session.userB.id,
      studentId: session.userA.id,
      overallComment: 'Good effort, but answers need more development.',
      grammarComment: 'Review tense control in Part 2.',
      suggestedNextSteps: 'Prepare examples before speaking.',
    });

    assert.equal(mentorReview.status, 'completed');
    assert.equal(mentorReview.mentorReview.overallComment, 'Good effort, but answers need more development.');

    const completeResult = await completeReview({
      sessionId: session.sessionId,
      userId: session.userB.id,
    });
    const results = await getResultsForUser({
      sessionId: session.sessionId,
      userId: session.userA.id,
    });

    assert.equal(completeResult.sessionStatus, 'completed');
    assert.equal(results.status, 'completed');
    assert.equal(results.sessionMode, 'mentor');
    assert.equal(results.mentorReview.overallComment, 'Good effort, but answers need more development.');
    assert.ok(results.turnResults.every((turn) => turn.aiStatus === 'not_required'));
    assert.deepEqual(
      results.turnResults.map((turn) => turn.durationMs),
      detail.turns.map((turn) => turn.durationMs)
    );

    const history = await getPracticeHistoryForUser({
      userId: session.userA.id,
    });
    const historySession = history.sessions.find((item) => item.id === session.sessionId);

    assert.equal(historySession.sessionMode, 'mentor');
    assert.equal(historySession.partner.displayName, 'Mentor Integration');
    assert.equal(historySession.partner.userRole, 'mentor');
    // Phiên mentor chỉ học viên nói, nên mọi lượt đều là lượt của học viên.
    assert.equal(historySession.turnCount, 8);
    assert.equal(historySession.speakingTurnCount, 8);
    assert.equal(historySession.notesReceivedCount, 1);
    assert.equal(historySession.resultStatus, 'mentor_reviewed');
  } finally {
    await cleanupSession(session);
  }
});

test('topic management creates, updates, lists, and deletes unused content', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('PostgreSQL local database is not available');
    return;
  }

  await prepareDatabase();

  let topicId = null;
  let questionId = null;

  try {
    const createdTopic = await createTopic({
      name: `Integration Topic ${Date.now()}`,
      targetBand: 'Band 6.0 - 7.0',
      status: 'draft',
      scope: 'system',
      actorUserId: seedAdminId,
    });
    topicId = createdTopic.topic.id;

    assert.equal(createdTopic.topic.status, 'draft');
    assert.equal(createdTopic.topic.questionCount, 0);

    const createdQuestion = await createQuestion({
      topicId,
      partNumber: 2,
      questionText: 'Describe a useful skill you learned.',
      cueCard: {
        prompt: 'Describe a useful skill you learned.',
        bulletPoints: ['what it was', 'how you learned it'],
      },
      suggestedPhrases: ['It helped me to', 'At first'],
      actorUserId: seedAdminId,
    });
    questionId = createdQuestion.question.id;

    assert.equal(createdQuestion.question.partNumber, 2);
    assert.deepEqual(createdQuestion.question.cueCard.bullet_points, ['what it was', 'how you learned it']);

    const updatedQuestion = await updateQuestion({
      questionId,
      partNumber: 3,
      questionText: 'Why do people need to keep learning new skills?',
      cueCard: null,
      suggestedPhrases: ['lifelong learning'],
      actorUserId: seedAdminId,
    });

    assert.equal(updatedQuestion.question.partNumber, 3);
    assert.equal(updatedQuestion.question.questionText, 'Why do people need to keep learning new skills?');

    const updatedTopic = await updateTopic({
      topicId,
      name: createdTopic.topic.name,
      targetBand: 'Band 6.5 - 7.5',
      status: 'open',
      actorUserId: seedAdminId,
    });

    assert.equal(updatedTopic.topic.status, 'open');
    assert.equal(updatedTopic.topic.scope, 'system');
    assert.equal(updatedTopic.topic.questionCount, 1);
    assert.equal(updatedTopic.questions.length, 1);

    const topics = await listTopics();
    assert.ok(topics.topics.some((topic) => topic.id === topicId));

    const detail = await getTopicDetail(topicId);
    assert.equal(detail.topic.partCounts.part3, 1);

    await deleteQuestion(questionId, { actorUserId: seedAdminId });
    questionId = null;
    await deleteTopic(topicId, { actorUserId: seedAdminId });
    topicId = null;
  } finally {
    if (questionId) {
      await pool.query('DELETE FROM questions WHERE id = $1', [questionId]);
    }

    if (topicId) {
      await pool.query('DELETE FROM topics WHERE id = $1', [topicId]);
    }
  }
});

test('mentor question sets are private and visible only to their owner plus system sets', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('PostgreSQL local database is not available');
    return;
  }

  await prepareDatabase();

  let topicId = null;

  try {
    const createdTopic = await createTopic({
      name: `Mentor Private Topic ${Date.now()}`,
      targetBand: 'Band 6.0',
      status: 'open',
      scope: 'mentor_private',
      ownerId: seedMentorId,
      actorUserId: seedMentorId,
    });
    topicId = createdTopic.topic.id;

    assert.equal(createdTopic.topic.scope, 'mentor_private');
    assert.equal(createdTopic.topic.ownerId, seedMentorId);

    await assert.rejects(
      () => createTopic({
        name: `Invalid System Topic ${Date.now()}`,
        status: 'open',
        scope: 'system',
        actorUserId: seedMentorId,
      }),
      /Only admin can manage system question sets/
    );

    const mentorTopics = await listTopics({ ownerId: seedMentorId });
    assert.ok(mentorTopics.topics.some((topic) => topic.id === topicId));
    assert.ok(mentorTopics.topics.every(
      (topic) => topic.scope === 'system' || topic.ownerId === seedMentorId
    ));

    await deleteTopic(topicId, { actorUserId: seedMentorId });
    topicId = null;
  } finally {
    if (topicId) {
      await pool.query('DELETE FROM topics WHERE id = $1', [topicId]);
    }
  }
});

test('topic management protects content already used by sessions', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('PostgreSQL local database is not available');
    return;
  }

  await prepareDatabase();

  let session = null;

  try {
    session = await createMatchedSession(
      'topic-protection-test-room',
      { userId: await createTestUser('Topic Test A', 6.5), band: 6.5 },
      { userId: await createTestUser('Topic Test B', 6), band: 6 }
    );
    const detail = await getSessionDetail(session.sessionId);
    const usedQuestionId = detail.turns[0].questionId;

    await assert.rejects(
      () => deleteTopic(detail.topic.id, { actorUserId: seedAdminId }),
      /Topic is used by existing sessions/
    );
    await assert.rejects(
      () => deleteQuestion(usedQuestionId, { actorUserId: seedAdminId }),
      /Question is used by existing turns/
    );
  } finally {
    await cleanupSession(session);
  }
});

test('classroom posts publish completed sessions and appear in the feed', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('PostgreSQL local database is not available');
    return;
  }

  await prepareDatabase();

  let session = null;

  try {
    session = await createMatchedSession(
      'classroom-integration-test-room',
      { userId: await createTestUser('Classroom Student', 6), band: 6 },
      { userId: await createTestUser('Classroom Mentor', null, 'mentor'), band: null },
      'mentor'
    );
    const detail = await getSessionDetail(session.sessionId);

    await markSessionActive(session.sessionId);
    await savePeerNotesBatch({
      sessionId: session.sessionId,
      listenerId: session.userB.id,
      notes: [{
        clientNoteId: 'classroom-note-1',
        turnId: detail.turns[0].id,
        timestampMs: 1000,
        errorType: 'fluency',
        noteText: 'Add one more example here',
      }],
    });
    await saveMentorReview({
      sessionId: session.sessionId,
      mentorId: session.userB.id,
      studentId: session.userA.id,
      overallComment: 'Strong idea development for classroom sharing.',
    });
    await completeReview({
      sessionId: session.sessionId,
      userId: session.userB.id,
    });

    const published = await publishClassroomPost({
      sessionId: session.sessionId,
      userId: session.userA.id,
      title: 'Classroom integration post',
      description: 'A completed mentor session shared to the classroom.',
    });

    assert.equal(published.post.title, 'Classroom integration post');
    assert.equal(published.post.status, 'pending');
    assert.equal(published.post.peerReviews.length, 1);
    assert.equal(published.post.peerReviews[0].notes.length, 1);

    // The other participant must consent before the post is public.
    await approveClassroomPost({
      postId: published.post.id,
      userId: session.userB.id,
    });

    const feed = await listClassroomPosts();
    assert.ok(feed.posts.some((post) => post.id === published.post.id));

    const detailPost = await getClassroomPost(published.post.id);
    // Đếm theo số lượt thật của phiên chứ không ghim một con số: bài đăng phải
    // mang đủ transcript của mọi lượt, dù format buổi luyện có đổi.
    const turnCount = await pool.query('SELECT COUNT(*)::int AS total FROM turns WHERE session_id = $1', [session.sessionId]);
    assert.equal(detailPost.post.aiTranscripts.length, turnCount.rows[0].total);
    assert.equal(detailPost.post.sessionMode, 'mentor');
    assert.equal(detailPost.post.peerReviews[0].notes[0].noteText, 'Add one more example here');
    assert.notEqual(
      detailPost.post.peerReviews[0].notes[0].questionText,
      detailPost.post.peerReviews[0].notes[0].noteText
    );

    const commentResult = await addClassroomComment({
      postId: published.post.id,
      userId: session.userB.id,
      commentText: 'This answer has useful examples.',
    });
    const likeResult = await toggleClassroomLike({
      postId: published.post.id,
      userId: session.userB.id,
    });
    const saveResult = await toggleClassroomSave({
      postId: published.post.id,
      userId: session.userB.id,
    });
    const viewedPost = await getClassroomPost(published.post.id, {
      userId: session.userB.id,
    });

    assert.equal(commentResult.comment.commentText, 'This answer has useful examples.');
    assert.equal(commentResult.commentsCount, 1);
    assert.equal(likeResult.isLiked, true);
    assert.equal(likeResult.likes, 1);
    assert.equal(saveResult.isSaved, true);
    assert.equal(saveResult.saves, 1);
    assert.equal(viewedPost.post.comments.length, 1);
    assert.equal(viewedPost.post.commentsCount, 1);
    assert.equal(viewedPost.post.likes, 1);
    assert.equal(viewedPost.post.saves, 1);
    assert.equal(viewedPost.post.isLiked, true);
    assert.equal(viewedPost.post.isSaved, true);

    const history = await getPracticeHistoryForUser({
      userId: session.userA.id,
    });
    const historySession = history.sessions.find((item) => item.id === session.sessionId);

    assert.equal(historySession.publicStatus, 'published');
  } finally {
    await cleanupSession(session);
  }
});

test('student work list exposes completed sessions and public status', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('PostgreSQL local database is not available');
    return;
  }

  await prepareDatabase();

  let session = null;

  try {
    session = await createMatchedSession(
      'student-work-integration-room',
      { userId: await createTestUser('Student Work A', 6.5), band: 6.5 },
      { userId: await createTestUser('Student Work Mentor', null, 'mentor'), band: null },
      'mentor'
    );
    await markSessionActive(session.sessionId);
    await saveMentorReview({
      sessionId: session.sessionId,
      mentorId: session.userB.id,
      studentId: session.userA.id,
      overallComment: 'Ready for the student work list.',
    });
    await completeReview({
      sessionId: session.sessionId,
      userId: session.userB.id,
    });

    const beforePublish = await listStudentWork();
    const listedSession = beforePublish.sessions.find((item) => item.id === session.sessionId);

    assert.equal(listedSession.reviewStatus, 'ready_to_publish');
    assert.equal(listedSession.publicStatus, 'private');
    assert.equal(listedSession.primaryStudent.displayName, 'Student Work A');

    const pendingPost = await publishClassroomPost({
      sessionId: session.sessionId,
      userId: session.userA.id,
      title: 'Student work published post',
      description: 'Published from student work.',
    });

    const whilePending = await listStudentWork();
    const pendingSession = whilePending.sessions.find((item) => item.id === session.sessionId);
    assert.equal(pendingSession.reviewStatus, 'pending');
    assert.equal(pendingSession.publicStatus, 'pending');

    await approveClassroomPost({
      postId: pendingPost.post.id,
      userId: session.userB.id,
    });

    const afterPublish = await listStudentWork();
    const publishedSession = afterPublish.sessions.find((item) => item.id === session.sessionId);

    assert.equal(publishedSession.reviewStatus, 'published');
    assert.equal(publishedSession.publicStatus, 'published');
    assert.ok(publishedSession.classroomPostId);
  } finally {
    await cleanupSession(session);
  }
});

test('notifications are created for mentor reviews and classroom publishing', async (t) => {
  if (!(await canUseDatabase())) {
    t.skip('PostgreSQL local database is not available');
    return;
  }

  await prepareDatabase();

  let session = null;

  try {
    session = await createMatchedSession(
      'notification-integration-room',
      { userId: await createTestUser('Notification Student', 6), band: 6 },
      { userId: await createTestUser('Notification Mentor', null, 'mentor'), band: null },
      'mentor'
    );
    await markSessionActive(session.sessionId);
    await saveMentorReview({
      sessionId: session.sessionId,
      mentorId: session.userB.id,
      studentId: session.userA.id,
      overallComment: 'Notification test review.',
    });

    const studentNotifications = await listNotificationsForUser({
      userId: session.userA.id,
    });
    const mentorReviewNotification = studentNotifications.notifications.find(
      (item) => item.type === 'mentor_review_completed'
    );

    assert.equal(studentNotifications.unreadCount >= 1, true);
    assert.equal(mentorReviewNotification.body, 'Notification test review.');

    const marked = await markNotificationRead({
      userId: session.userA.id,
      notificationId: mentorReviewNotification.id,
    });
    assert.equal(marked.notification.isRead, true);

    const pendingPost = await publishClassroomPost({
      sessionId: session.sessionId,
      userId: session.userA.id,
      title: 'Notification classroom post',
      description: 'Publishing should notify the mentor.',
    });

    const repeatedPendingPost = await publishClassroomPost({
      sessionId: session.sessionId,
      userId: session.userA.id,
      title: 'Notification classroom post',
      description: 'A retry must not create another notification.',
    });
    assert.equal(repeatedPendingPost.post.id, pendingPost.post.id);
    assert.equal(repeatedPendingPost.post.status, 'pending');

    // The approver (userB) is asked to consent before anything goes public.
    const consentNotifications = await listNotificationsForUser({
      userId: session.userB.id,
    });
    const consentRequest = consentNotifications.notifications.find(
      (item) => item.type === 'classroom_consent_request'
    );
    assert.equal(consentRequest.title, 'Có người muốn đăng phiên luyện chung lên Lớp học');
    assert.equal(
      consentNotifications.notifications.filter(
        (item) => item.type === 'classroom_consent_request' && item.entityId === pendingPost.post.id
      ).length,
      1
    );

    await approveClassroomPost({
      postId: pendingPost.post.id,
      userId: session.userB.id,
    });

    const repeatedPublishedPost = await publishClassroomPost({
      sessionId: session.sessionId,
      userId: session.userA.id,
      title: 'Notification classroom post',
      description: 'A published post must stay published.',
    });
    assert.equal(repeatedPublishedPost.post.status, 'published');

    const approverNotifications = await listNotificationsForUser({
      userId: session.userB.id,
    });
    const consentRequestsAfterApproval = approverNotifications.notifications.filter(
      (item) => item.type === 'classroom_consent_request' && item.entityId === pendingPost.post.id
    );
    assert.equal(consentRequestsAfterApproval.length, 1);
    assert.equal(consentRequestsAfterApproval[0].isRead, true);

    // After consent, both participants get a "published" notification.
    const authorNotifications = await listNotificationsForUser({
      userId: session.userA.id,
    });
    const publishedNotification = authorNotifications.notifications.find(
      (item) => item.type === 'classroom_post_published'
    );
    assert.equal(publishedNotification.title, 'Bài luyện đã được public lên Lớp học');

    const readAll = await markAllNotificationsRead(session.userB.id);
    assert.equal(readAll.updated >= 1, true);
  } finally {
    await cleanupSession(session);
  }
});
