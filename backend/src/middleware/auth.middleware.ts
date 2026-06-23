import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { HttpError } from './error.middleware.js';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  deviceId: string;
}

const DISABLED_KEY = (userId: string) => `disabled:user:${userId}`;

export async function blockUser(userId: string): Promise<void> {
  // Block for slightly longer than the JWT expiry so there's no gap
  const ttlSeconds = 7200; // 2 hours
  await redis.set(DISABLED_KEY(userId), '1', 'EX', ttlSeconds);
}

export async function unblockUser(userId: string): Promise<void> {
  await redis.del(DISABLED_KEY(userId));
}

export const requireAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new HttpError(401, 'Missing or invalid Authorization header'));
    }

    const token = header.slice('Bearer '.length);

    let payload: AuthUser;
    try {
      payload = jwt.verify(token, env.jwtSecret) as AuthUser;
    } catch {
      return next(new HttpError(401, 'Invalid or expired token'));
    }

    // Check Redis block list — fail open if Redis is unavailable
    try {
      const blocked = await redis.get(DISABLED_KEY(payload.id));
      if (blocked) return next(new HttpError(403, 'Account is disabled'));
    } catch { /* Redis down — allow request through */ }

    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
};

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, 'Insufficient permissions');
    }
    next();
  };
}
