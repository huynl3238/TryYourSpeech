import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 3) return null; // stop retrying after 3 attempts
    return Math.min(times * 200, 2000);
  },
});

function getErrorMessage(err) {
  return err.message || 'Unknown Redis error';
}

redis.on('error', () => {
  // suppress unhandled error events when Redis is unavailable
});

async function connectRedisIfNeeded() {
  if (redis.status === 'ready') {
    return;
  }

  if (redis.status === 'wait' || redis.status === 'end') {
    await redis.connect();
  }
}

export async function checkRedisConnection() {
  try {
    await connectRedisIfNeeded();
    await redis.ping();

    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

export async function testRedisConnection() {
  const result = await checkRedisConnection();

  if (result.ok) {
    console.log('Redis connected');
    return;
  }

  console.warn('Redis not available:', result.error);
}

export default redis;
