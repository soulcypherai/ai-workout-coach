import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  console.error('[Redis] connection error:', err);
});

export default redis; 