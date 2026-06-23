import { createReadStream, existsSync } from 'node:fs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../middleware/error.middleware.js';
import { writeAuditLog } from '../../utils/audit.js';
import * as usersService from './users.service.js';

const updateProfileSchema = z.object({
  displayName: z.string().min(1).optional(),
  department: z.string().nullable().optional(),
});

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3),
  displayName: z.string().min(1),
  password: z.string().min(8),
  department: z.string().optional(),
  role: z.enum(['employee', 'admin']).optional(),
});

export async function createUserHandler(req: Request, res: Response) {
  const body = createUserSchema.parse(req.body);
  const user = await usersService.createUser(body);
  writeAuditLog('users.created', {
    userId: req.user!.id,
    targetType: 'user',
    targetId: user.id as string,
    ipAddress: req.ip,
    metadata: { email: body.email, role: body.role ?? 'employee' },
  });
  res.status(201).json({ user });
}

export async function listUsersHandler(_req: Request, res: Response) {
  const users = await usersService.listUsers();
  res.json({ users });
}

export async function listDirectoryHandler(req: Request, res: Response) {
  const users = await usersService.listDirectory(req.user!.id);
  res.json({ users });
}

export async function getMyProfileHandler(req: Request, res: Response) {
  const profile = await usersService.getProfile(req.user!.id);
  if (!profile) throw new HttpError(404, 'User not found');
  res.json({ profile });
}

export async function updateProfileHandler(req: Request, res: Response) {
  const body = updateProfileSchema.parse(req.body);
  const profile = await usersService.updateProfile(req.user!.id, body);
  res.json({ profile });
}

export async function updateAvatarHandler(req: Request, res: Response) {
  if (!req.file) throw new HttpError(400, 'No image uploaded');
  if (!req.file.mimetype.startsWith('image/')) throw new HttpError(400, 'File must be an image');
  const profile = await usersService.updateAvatar(req.user!.id, req.file.buffer);
  res.json({ profile });
}

export async function getUserAvatarHandler(req: Request, res: Response) {
  const filePath = usersService.resolveAvatarPath(req.params.userId);
  if (!existsSync(filePath)) throw new HttpError(404, 'Avatar not found');
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  createReadStream(filePath).pipe(res);
}

export async function getNotificationPrefsHandler(req: Request, res: Response) {
  const prefs = await usersService.getNotificationPrefs(req.user!.id);
  res.json({ prefs });
}

export async function updateNotificationPrefsHandler(req: Request, res: Response) {
  const body = z
    .object({
      soundEnabled: z.boolean().optional(),
      desktopEnabled: z.boolean().optional(),
      emailEnabled: z.boolean().optional(),
    })
    .parse(req.body);

  const prefs = await usersService.updateNotificationPrefs(req.user!.id, body);
  res.json({ prefs });
}

export async function changePasswordHandler(req: Request, res: Response) {
  const body = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    })
    .parse(req.body);

  await usersService.changePassword(req.user!.id, body.currentPassword, body.newPassword);
  writeAuditLog('auth.password_changed', { userId: req.user!.id, ipAddress: req.ip });
  res.status(204).send();
}

const pushTokenSchema = z.object({ token: z.string().min(1).max(500) });

export async function registerPushTokenHandler(req: Request, res: Response) {
  const { token } = pushTokenSchema.parse(req.body);
  await usersService.registerPushToken(req.user!.id, req.params.deviceId, token);
  res.status(204).send();
}

export async function clearPushTokenHandler(req: Request, res: Response) {
  await usersService.clearPushToken(req.user!.id, req.params.deviceId);
  res.status(204).send();
}
