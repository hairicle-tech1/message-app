import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../middleware/error.middleware.js';
import * as authService from './auth.service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceName: z.string().min(1).optional(),
});

export async function loginHandler(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  const result = await authService.login(body.email, body.password, body.deviceName);
  res.json(result);
}

export async function meHandler(req: Request, res: Response) {
  if (!req.user) {
    throw new HttpError(401, 'Not authenticated');
  }

  const user = await authService.getUserById(req.user.id);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  res.json({ user });
}
