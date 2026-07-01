import { createRequire } from 'node:module';
import type { Redis as RedisClient } from 'ioredis';
import { env } from './env.js';

const require = createRequire(import.meta.url);
const Redis = require('ioredis') as new (url: string, options?: object) => RedisClient;

const isTls = env.redisUrl.startsWith('rediss://');

export const redis = new Redis(env.redisUrl, {
  tls: isTls ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err: Error) => {
  console.error('[redis] connection error:', err.message);
});
