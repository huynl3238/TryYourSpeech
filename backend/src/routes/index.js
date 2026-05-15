import { Router } from 'express';
import { checkDbConnection } from '../config/db.js';
import { checkRedisConnection } from '../config/redis.js';
import { getSessionDetail } from '../models/sessionModel.js';

const router = Router();

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
    const sessionDetail = await getSessionDetail(req.params.sessionId);

    if (!sessionDetail) {
      res.status(404).json({ error: 'Không tìm thấy phiên luyện tập' });
      return;
    }

    res.json(sessionDetail);
  } catch (err) {
    console.error('Failed to get session detail:', err.message);
    res.status(500).json({ error: 'Không thể tải phiên luyện tập' });
  }
});

export default router;
