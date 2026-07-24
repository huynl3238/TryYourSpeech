import { Router } from 'express';
import { mkdir, rename, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { saveAudioUpload, validateAudioUpload } from '../models/audioModel.js';
import { checkDbConnection } from '../config/db.js';
import { checkRedisConnection } from '../config/redis.js';
import { completeReview, savePeerNotesBatch } from '../models/reviewModel.js';
import { getResultsForUser, retryFailedResults } from '../models/resultsModel.js';
import { getSessionDetail } from '../models/sessionModel.js';
import { saveMentorReview } from '../models/mentorReviewModel.js';
import { getPracticeHistoryForUser } from '../models/practiceHistoryModel.js';
import { createIdentity, getUserProfile, updateUserProfile } from '../models/userProfileModel.js';
import { getAiConfigStatus } from '../models/aiPipelineModel.js';
import {
  createQuestion,
  createTopic,
  deleteQuestion,
  deleteTopic,
  getTopicDetail,
  listTopics,
  updateQuestion,
  updateTopic,
} from '../models/topicModel.js';
import {
  addClassroomComment,
  approveClassroomPost,
  declineClassroomPost,
  getClassroomPost,
  listClassroomPosts,
  publishClassroomPost,
  toggleClassroomLike,
  toggleClassroomSave,
} from '../models/classroomModel.js';
import { listStudentWork } from '../models/studentWorkModel.js';
import {
  applyToMentorSession,
  chooseApplicantAndStart,
  closeMentorSession,
  leaveMentorSession,
  listMentorHostedSessions,
  listOpenMentorSessions,
  openMentorSession,
} from '../models/mentorSessionModel.js';
import {
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../models/notificationModel.js';
import { convertWebmToWav } from '../services/audioConversion.js';

const router = Router();
const uploadsDirectory = fileURLToPath(new URL('../../uploads', import.meta.url));
const tempDirectory = join(uploadsDirectory, 'tmp');
const audioDirectory = join(uploadsDirectory, 'audio');
const maxAudioFileSize = 25 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorTypes = new Set([
  'grammar_error',
  'collocation_issue',
  'pause_filler',
  'false_start',
  'pronunciation_issue',
  'advanced_vocab',
  'good_connector',
  'idea_development',
  'pronunciation',
  'grammar',
  'vocabulary',
  'fluency',
]);
const audioUploadEnabled = process.env.AI_AUDIO_UPLOAD_ENABLED === 'true';

const upload = multer({
  dest: tempDirectory,
  limits: {
    fileSize: maxAudioFileSize,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'audio/webm') {
      cb(new Error('audio must be an audio/webm file'));
      return;
    }

    cb(null, true);
  },
});

function uploadSingleAudio(req, res, next) {
  upload.single('audio')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'audio file must be 25MB or smaller'
      : err.message;
    res.status(400).json({ error: message });
  });
}

function requireAudioUploadEnabled(_req, res, next) {
  if (!audioUploadEnabled) {
    res.status(503).json({
      error: 'Audio upload và AI pronunciation assessment đang tạm tắt để test video call',
    });
    return;
  }

  next();
}

function parsePositiveInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function isValidUuid(value) {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isRequestObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function requireRequestObject(value) {
  if (!isRequestObject(value)) {
    throw new Error('request body is invalid');
  }
}

function requireUuid(value, fieldName) {
  if (!isValidUuid(value)) {
    throw new Error(`${fieldName} is invalid`);
  }
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
}

function validateNotePayload(note) {
  if (!isRequestObject(note)) {
    throw new Error('note is invalid');
  }

  requireUuid(note.turnId, 'note.turnId');
  requireNonEmptyString(note.clientNoteId, 'note.clientNoteId');
  requireNonNegativeInteger(note.timestampMs, 'note.timestampMs');

  if (!errorTypes.has(note.errorType)) {
    throw new Error('note.errorType is invalid');
  }

  if (note.noteText !== undefined && note.noteText !== null && typeof note.noteText !== 'string') {
    throw new Error('note.noteText is invalid');
  }
}

function validatePeerNotesPayload({ sessionId, listenerId, notes }) {
  requireUuid(sessionId, 'sessionId');
  requireUuid(listenerId, 'listenerId');

  if (!Array.isArray(notes)) {
    throw new Error('notes must be an array');
  }

  for (const note of notes) {
    validateNotePayload(note);
  }
}

async function deleteFileIfExists(filePath) {
  if (!filePath) {
    return;
  }

  await rm(filePath, { force: true });
}

async function replaceUploadedFile(sourcePath, destinationPath) {
  const backupPath = `${destinationPath}.${randomUUID()}.bak`;
  let hasBackup = false;

  try {
    await rename(destinationPath, backupPath);
    hasBackup = true;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  try {
    await rename(sourcePath, destinationPath);
    return { backupPath, hasBackup };
  } catch (err) {
    if (hasBackup) {
      await rename(backupPath, destinationPath);
    }

    throw err;
  }
}

async function restorePreviousFile(destinationPath, replacement) {
  if (!replacement) {
    return;
  }

  await rm(destinationPath, { force: true });

  if (replacement.hasBackup) {
    await rename(replacement.backupPath, destinationPath);
  }
}

function getIceServers() {
  try {
    const configuredIceServers = JSON.parse(process.env.ICE_SERVERS || '[]');

    if (!Array.isArray(configuredIceServers)) {
      return [{ urls: 'stun:stun.l.google.com:19302' }];
    }

    return [
      { urls: 'stun:stun.l.google.com:19302' },
      ...configuredIceServers,
    ];
  } catch (err) {
    console.warn('Invalid ICE_SERVERS config:', err.message);
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

router.get('/', (_req, res) => {
  res.json({ message: 'IELTS Speaking API' });
});

router.get('/config', (_req, res) => {
  res.json({ iceServers: getIceServers() });
});

router.get('/health', async (_req, res) => {
  const [database, redis] = await Promise.all([
    checkDbConnection(),
    checkRedisConnection(),
  ]);
  const ai = getAiConfigStatus();

  const isHealthy = database.ok && redis.ok;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    services: {
      database,
      redis,
      ai,
    },
  });
});

router.get('/sessions/:sessionId', async (req, res) => {
  try {
    requireUuid(req.params.sessionId, 'sessionId');
    res.set('Cache-Control', 'no-store');

    const sessionDetail = await getSessionDetail(req.params.sessionId);

    if (!sessionDetail) {
      res.status(404).json({ error: 'Không tìm thấy phiên luyện tập' });
      return;
    }

    res.json(sessionDetail);
  } catch (err) {
    console.warn('Failed to get session detail:', err.message);
    if (err.message.endsWith('is invalid')) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: 'Không thể tải phiên luyện tập' });
  }
});

router.get('/users/:userId/practice-history', async (req, res) => {
  try {
    requireUuid(req.params.userId, 'userId');
    res.set('Cache-Control', 'no-store');

    const limit = req.query.limit === undefined
      ? 50
      : parsePositiveInteger(req.query.limit);
    if (limit === null) {
      res.status(400).json({ error: 'limit must be a positive integer' });
      return;
    }

    const history = await getPracticeHistoryForUser({
      userId: req.params.userId,
      limit,
    });

    if (!history) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(history);
  } catch (err) {
    console.warn('Failed to get practice history:', err.message);
    if (err.message.endsWith('is invalid')) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: 'Khong the tai lich su luyen tap' });
  }
});

router.post('/users', async (req, res) => {
  try {
    requireRequestObject(req.body);
    requireNonEmptyString(req.body.displayName, 'displayName');

    const result = await createIdentity(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn('Failed to create identity:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.get('/users/:userId/profile', async (req, res) => {
  try {
    requireUuid(req.params.userId, 'userId');
    res.set('Cache-Control', 'no-store');

    const profile = await getUserProfile(req.params.userId);

    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(profile);
  } catch (err) {
    console.warn('Failed to get user profile:', err.message);
    if (err.message.endsWith('is invalid')) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: 'Khong the tai ho so nguoi dung' });
  }
});

router.get('/users/:userId/notifications', async (req, res) => {
  try {
    requireUuid(req.params.userId, 'userId');
    const limit = req.query.limit === undefined
      ? 50
      : parsePositiveInteger(req.query.limit);
    if (limit === null) {
      res.status(400).json({ error: 'limit must be a positive integer' });
      return;
    }

    res.set('Cache-Control', 'no-store');
    const result = await listNotificationsForUser({
      userId: req.params.userId,
      limit,
    });

    if (!result) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.warn('Failed to list notifications:', err.message);
    if (err.message.endsWith('is invalid')) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: 'Khong the tai thong bao' });
  }
});

router.patch('/users/:userId/notifications/:notificationId/read', async (req, res) => {
  try {
    requireUuid(req.params.userId, 'userId');
    requireUuid(req.params.notificationId, 'notificationId');

    const result = await markNotificationRead({
      userId: req.params.userId,
      notificationId: req.params.notificationId,
    });

    if (!result) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.warn('Failed to mark notification read:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/users/:userId/notifications/read-all', async (req, res) => {
  try {
    requireUuid(req.params.userId, 'userId');
    const result = await markAllNotificationsRead(req.params.userId);
    res.json(result);
  } catch (err) {
    console.warn('Failed to mark all notifications read:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/users/:userId/profile', async (req, res) => {
  try {
    requireUuid(req.params.userId, 'userId');
    requireRequestObject(req.body);
    requireNonEmptyString(req.body.displayName, 'displayName');

    const profile = await updateUserProfile({
      userId: req.params.userId,
      displayName: req.body.displayName,
      band: req.body.band,
    });

    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(profile);
  } catch (err) {
    console.warn('Failed to update user profile:', err.message);
    if (err.message.endsWith('is invalid')) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

router.get('/topics', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const ownerId = typeof req.query.ownerId === 'string' && req.query.ownerId.trim()
      ? req.query.ownerId.trim()
      : null;
    const result = await listTopics({ ownerId });
    res.json(result);
  } catch (err) {
    console.warn('Failed to list topics:', err.message);
    res.status(500).json({ error: 'Khong the tai danh sach chu de' });
  }
});

router.post('/topics', async (req, res) => {
  try {
    requireRequestObject(req.body);
    requireNonEmptyString(req.body.name, 'name');
    requireUuid(req.body.actorUserId, 'actorUserId');

    const result = await createTopic(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn('Failed to create topic:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.get('/topics/:topicId', async (req, res) => {
  try {
    requireUuid(req.params.topicId, 'topicId');
    res.set('Cache-Control', 'no-store');

    const result = await getTopicDetail(req.params.topicId);

    if (!result) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.warn('Failed to get topic detail:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/topics/:topicId', async (req, res) => {
  try {
    requireUuid(req.params.topicId, 'topicId');
    requireRequestObject(req.body);
    requireNonEmptyString(req.body.name, 'name');
    requireUuid(req.body.actorUserId, 'actorUserId');

    const result = await updateTopic({
      topicId: req.params.topicId,
      ...req.body,
    });

    if (!result) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.warn('Failed to update topic:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/topics/:topicId', async (req, res) => {
  try {
    requireUuid(req.params.topicId, 'topicId');
    requireUuid(req.query.actorUserId, 'actorUserId');
    const result = await deleteTopic(req.params.topicId, {
      actorUserId: req.query.actorUserId,
    });
    res.json(result);
  } catch (err) {
    console.warn('Failed to delete topic:', err.message);
    if (err.message === 'Topic not found') {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

router.post('/topics/:topicId/questions', async (req, res) => {
  try {
    requireUuid(req.params.topicId, 'topicId');
    requireRequestObject(req.body);
    requireNonEmptyString(req.body.questionText, 'questionText');
    requireUuid(req.body.actorUserId, 'actorUserId');

    const result = await createQuestion({
      topicId: req.params.topicId,
      ...req.body,
    });

    res.status(201).json(result);
  } catch (err) {
    console.warn('Failed to create question:', err.message);
    if (err.message === 'Topic not found') {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

router.patch('/questions/:questionId', async (req, res) => {
  try {
    requireUuid(req.params.questionId, 'questionId');
    requireRequestObject(req.body);
    requireNonEmptyString(req.body.questionText, 'questionText');
    requireUuid(req.body.actorUserId, 'actorUserId');

    const result = await updateQuestion({
      questionId: req.params.questionId,
      ...req.body,
    });

    if (!result) {
      res.status(404).json({ error: 'Question not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.warn('Failed to update question:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/questions/:questionId', async (req, res) => {
  try {
    requireUuid(req.params.questionId, 'questionId');
    requireUuid(req.query.actorUserId, 'actorUserId');
    const result = await deleteQuestion(req.params.questionId, {
      actorUserId: req.query.actorUserId,
    });

    if (!result) {
      res.status(404).json({ error: 'Question not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.warn('Failed to delete question:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.get('/classroom/posts', async (_req, res) => {
  try {
    if (_req.query.userId !== undefined) {
      requireUuid(_req.query.userId, 'userId');
    }

    res.set('Cache-Control', 'no-store');
    const result = await listClassroomPosts({ userId: _req.query.userId || null });
    res.json(result);
  } catch (err) {
    console.warn('Failed to list classroom posts:', err.message);
    if (err.message.endsWith('is invalid')) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: 'Khong the tai lop hoc' });
  }
});

router.get('/teacher/student-work', async (req, res) => {
  try {
    const limit = req.query.limit === undefined
      ? 50
      : parsePositiveInteger(req.query.limit);
    if (limit === null) {
      res.status(400).json({ error: 'limit must be a positive integer' });
      return;
    }

    res.set('Cache-Control', 'no-store');
    const result = await listStudentWork({ limit });
    res.json(result);
  } catch (err) {
    console.warn('Failed to list student work:', err.message);
    res.status(500).json({ error: 'Khong the tai bai hoc vien' });
  }
});

router.get('/classroom/posts/:postId', async (req, res) => {
  try {
    requireUuid(req.params.postId, 'postId');
    if (req.query.userId !== undefined) {
      requireUuid(req.query.userId, 'userId');
    }

    res.set('Cache-Control', 'no-store');

    const result = await getClassroomPost(req.params.postId, { userId: req.query.userId || null });
    if (!result) {
      res.status(404).json({ error: 'Classroom post not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.warn('Failed to get classroom post:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/classroom/posts', async (req, res) => {
  try {
    requireRequestObject(req.body);
    requireUuid(req.body.sessionId, 'sessionId');
    requireUuid(req.body.userId, 'userId');
    requireNonEmptyString(req.body.title, 'title');

    const result = await publishClassroomPost(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn('Failed to publish classroom post:', err.message);
    if (err.message === 'Session not found') {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

router.post('/classroom/posts/:postId/comments', async (req, res) => {
  try {
    requireUuid(req.params.postId, 'postId');
    requireRequestObject(req.body);
    requireUuid(req.body.userId, 'userId');
    requireNonEmptyString(req.body.commentText, 'commentText');

    const result = await addClassroomComment({
      postId: req.params.postId,
      userId: req.body.userId,
      commentText: req.body.commentText,
    });

    res.status(201).json(result);
  } catch (err) {
    console.warn('Failed to add classroom comment:', err.message);
    if (err.message.endsWith('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

router.post('/classroom/posts/:postId/like', async (req, res) => {
  try {
    requireUuid(req.params.postId, 'postId');
    requireRequestObject(req.body);
    requireUuid(req.body.userId, 'userId');

    const result = await toggleClassroomLike({
      postId: req.params.postId,
      userId: req.body.userId,
    });

    res.json(result);
  } catch (err) {
    console.warn('Failed to toggle classroom like:', err.message);
    if (err.message.endsWith('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

router.post('/classroom/posts/:postId/save', async (req, res) => {
  try {
    requireUuid(req.params.postId, 'postId');
    requireRequestObject(req.body);
    requireUuid(req.body.userId, 'userId');

    const result = await toggleClassroomSave({
      postId: req.params.postId,
      userId: req.body.userId,
    });

    res.json(result);
  } catch (err) {
    console.warn('Failed to toggle classroom save:', err.message);
    if (err.message.endsWith('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message });
  }
});

// --- Mentor-led sessions -------------------------------------------------
router.post('/mentor-sessions', async (req, res) => {
  try {
    requireRequestObject(req.body);
    requireUuid(req.body.mentorId, 'mentorId');

    const result = await openMentorSession(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn('Failed to open mentor session:', err.message);
    if (err.message.endsWith('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

router.get('/mentor-sessions', async (req, res) => {
  try {
    const studentId = req.query.studentId;
    if (studentId !== undefined) {
      requireUuid(studentId, 'studentId');
    }

    const result = await listOpenMentorSessions({ studentId: studentId || null });
    res.json(result);
  } catch (err) {
    console.warn('Failed to list mentor sessions:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.get('/mentors/:mentorId/sessions', async (req, res) => {
  try {
    requireUuid(req.params.mentorId, 'mentorId');

    const result = await listMentorHostedSessions({ mentorId: req.params.mentorId });
    res.json(result);
  } catch (err) {
    console.warn('Failed to list hosted mentor sessions:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/mentor-sessions/:mentorSessionId/apply', async (req, res) => {
  try {
    requireUuid(req.params.mentorSessionId, 'mentorSessionId');
    requireRequestObject(req.body);
    requireUuid(req.body.studentId, 'studentId');

    const result = await applyToMentorSession({
      mentorSessionId: req.params.mentorSessionId,
      studentId: req.body.studentId,
    });
    res.status(201).json(result);
  } catch (err) {
    console.warn('Failed to apply to mentor session:', err.message);
    if (err.message.endsWith('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

router.post('/mentor-sessions/:mentorSessionId/leave', async (req, res) => {
  try {
    requireUuid(req.params.mentorSessionId, 'mentorSessionId');
    requireRequestObject(req.body);
    requireUuid(req.body.studentId, 'studentId');

    const result = await leaveMentorSession({
      mentorSessionId: req.params.mentorSessionId,
      studentId: req.body.studentId,
    });
    res.json(result);
  } catch (err) {
    console.warn('Failed to leave mentor session:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/mentor-sessions/:mentorSessionId/start', async (req, res) => {
  try {
    requireUuid(req.params.mentorSessionId, 'mentorSessionId');
    requireRequestObject(req.body);
    requireUuid(req.body.mentorId, 'mentorId');
    requireUuid(req.body.studentId, 'studentId');

    const result = await chooseApplicantAndStart({
      mentorSessionId: req.params.mentorSessionId,
      mentorId: req.body.mentorId,
      studentId: req.body.studentId,
    });
    res.status(201).json(result);
  } catch (err) {
    console.warn('Failed to start mentor session:', err.message);
    if (err.message.endsWith('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

router.post('/mentor-sessions/:mentorSessionId/close', async (req, res) => {
  try {
    requireUuid(req.params.mentorSessionId, 'mentorSessionId');
    requireRequestObject(req.body);
    requireUuid(req.body.mentorId, 'mentorId');

    const result = await closeMentorSession({
      mentorSessionId: req.params.mentorSessionId,
      mentorId: req.body.mentorId,
    });
    res.json(result);
  } catch (err) {
    console.warn('Failed to close mentor session:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/classroom/posts/:postId/approve', async (req, res) => {
  try {
    requireUuid(req.params.postId, 'postId');
    requireRequestObject(req.body);
    requireUuid(req.body.userId, 'userId');

    const result = await approveClassroomPost({
      postId: req.params.postId,
      userId: req.body.userId,
    });
    res.json(result);
  } catch (err) {
    console.warn('Failed to approve classroom post:', err.message);
    if (err.message.endsWith('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

router.post('/classroom/posts/:postId/decline', async (req, res) => {
  try {
    requireUuid(req.params.postId, 'postId');
    requireRequestObject(req.body);
    requireUuid(req.body.userId, 'userId');

    const result = await declineClassroomPost({
      postId: req.params.postId,
      userId: req.body.userId,
    });
    res.json(result);
  } catch (err) {
    console.warn('Failed to decline classroom post:', err.message);
    if (err.message.endsWith('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

router.get('/results/:sessionId', async (req, res) => {
  try {
    requireUuid(req.params.sessionId, 'sessionId');
    requireUuid(req.query.userId, 'userId');

    const results = await getResultsForUser({
      sessionId: req.params.sessionId,
      userId: req.query.userId,
    });

    if (!results) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json(results);
  } catch (err) {
    console.warn('Failed to get results:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/results/:sessionId/retry', async (req, res) => {
  try {
    requireUuid(req.params.sessionId, 'sessionId');
    requireRequestObject(req.body);
    requireUuid(req.body.userId, 'userId');

    if (req.body.turnId !== undefined) {
      requireUuid(req.body.turnId, 'turnId');
    }

    const result = await retryFailedResults({
      sessionId: req.params.sessionId,
      userId: req.body.userId,
      turnId: req.body.turnId,
    });

    res.json(result);
  } catch (err) {
    console.warn('Failed to retry results:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/audio/upload', requireAudioUploadEnabled, uploadSingleAudio, async (req, res) => {
  let finalPath = null;
  let wavPath = null;
  let replacement = null;

  try {
    if (!req.file) {
      throw new Error('audio is required');
    }

    requireRequestObject(req.body);

    const { turnId, sessionId, speakerId, questionId } = req.body;
    const durationMs = parsePositiveInteger(req.body.durationMs);

    requireUuid(turnId, 'turnId');
    requireUuid(sessionId, 'sessionId');
    requireUuid(speakerId, 'speakerId');
    requireUuid(questionId, 'questionId');

    await validateAudioUpload({
      sessionId,
      turnId,
      speakerId,
      questionId,
      durationMs,
    });

    await mkdir(audioDirectory, { recursive: true });

    finalPath = join(audioDirectory, `${turnId}.webm`);
    wavPath = join(tempDirectory, `${turnId}-${randomUUID()}.wav`);
    replacement = await replaceUploadedFile(req.file.path, finalPath);
    await convertWebmToWav(finalPath, wavPath);

    const result = await saveAudioUpload({
      sessionId,
      turnId,
      speakerId,
      questionId,
      durationMs,
      audioUrl: `/uploads/audio/${turnId}.webm`,
    });

    await deleteFileIfExists(replacement.backupPath);
    res.json(result);
  } catch (err) {
    await deleteFileIfExists(req.file?.path);
    await deleteFileIfExists(wavPath);
    await restorePreviousFile(finalPath, replacement);
    console.warn('Failed to upload audio:', err.message);
    res.status(400).json({ error: err.message });
  } finally {
    await deleteFileIfExists(wavPath);
  }
});

router.post('/peer-notes/batch', async (req, res) => {
  try {
    requireRequestObject(req.body);
    validatePeerNotesPayload(req.body);

    const result = await savePeerNotesBatch(req.body);
    res.json(result);
  } catch (err) {
    console.warn('Failed to save peer notes:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/mentor-reviews', async (req, res) => {
  try {
    requireRequestObject(req.body);
    requireUuid(req.body.sessionId, 'sessionId');
    requireUuid(req.body.mentorId, 'mentorId');
    requireUuid(req.body.studentId, 'studentId');
    requireNonEmptyString(req.body.overallComment, 'overallComment');

    const result = await saveMentorReview(req.body);
    res.json(result);
  } catch (err) {
    console.warn('Failed to save mentor review:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/review/complete', async (req, res) => {
  try {
    requireRequestObject(req.body);
    requireUuid(req.body.sessionId, 'sessionId');
    requireUuid(req.body.userId, 'userId');

    const result = await completeReview(req.body);
    res.json(result);
  } catch (err) {
    console.warn('Failed to complete review:', err.message);
    res.status(400).json({ error: err.message });
  }
});

export default router;
