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
import { getResultsForUser } from '../models/resultsModel.js';
import { getSessionDetail } from '../models/sessionModel.js';
import { convertWebmToWav } from '../services/audioConversion.js';

const router = Router();
const uploadsDirectory = fileURLToPath(new URL('../../uploads', import.meta.url));
const tempDirectory = join(uploadsDirectory, 'tmp');
const audioDirectory = join(uploadsDirectory, 'audio');
const maxAudioFileSize = 25 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function requireUuid(value, fieldName) {
  if (!isValidUuid(value)) {
    throw new Error(`${fieldName} is invalid`);
  }
}

function validatePeerNotesPayload({ sessionId, listenerId, notes }) {
  requireUuid(sessionId, 'sessionId');
  requireUuid(listenerId, 'listenerId');

  if (!Array.isArray(notes)) {
    throw new Error('notes must be an array');
  }

  for (const note of notes) {
    if (!note || typeof note !== 'object') {
      throw new Error('note is invalid');
    }

    requireUuid(note.turnId, 'note.turnId');
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

  const isHealthy = database.ok && redis.ok;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    services: {
      database,
      redis,
    },
  });
});

router.get('/sessions/:sessionId', async (req, res) => {
  try {
    requireUuid(req.params.sessionId, 'sessionId');

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

router.post('/audio/upload', uploadSingleAudio, async (req, res) => {
  let finalPath = null;
  let wavPath = null;
  let replacement = null;

  try {
    if (!req.file) {
      throw new Error('audio is required');
    }

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
    validatePeerNotesPayload(req.body);

    const result = await savePeerNotesBatch(req.body);
    res.json(result);
  } catch (err) {
    console.warn('Failed to save peer notes:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/review/complete', async (req, res) => {
  try {
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
