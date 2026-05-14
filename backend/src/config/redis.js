import Redis from 'ioredis';

let retryCount = 0;

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 3) return null; // stop retrying after 3 attempts
    retryCount = times;
    return Math.min(times * 200, 2000);
  },
});

redis.on('error', () => {
  // suppress unhandled error events when Redis is unavailable
});

export async function testRedisConnection() {
  try {
    await redis.connect();
    console.log('Redis connected');
  } catch (err) {
    console.warn('Redis not available:', err.message);
  }
}

export default redis;
