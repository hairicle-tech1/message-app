import { createRequire } from 'node:module';
import type { Redis as RedisClient } from 'ioredis';
import { env } from './env.js';

const require = createRequire(import.meta.url);
const Redis = require('ioredis') as new (url: string) => RedisClient;

export const redis = new Redis(env.redisUrl);
