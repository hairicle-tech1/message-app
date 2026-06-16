import { createReadStream, existsSync } from 'node:fs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../middleware/error.middleware.js';
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
  const user = await usersService.getProfile(req.user!.id);
  res.json({ user });
}

export async function updateProfileHandler(req: Request, res: Response) {
  const body = updateProfileSchema.parse(req.body);
  const user = await usersService.updateProfile(req.user!.id, body);
  res.json({ user });
}

export async function updateAvatarHandler(req: Request, res: Response) {
  if (!req.file) throw new HttpError(400, 'No image uploaded');
  if (!req.file.mimetype.startsWith('image/')) throw new HttpError(400, 'File must be an image');
  const user = await usersService.updateAvatar(req.user!.id, req.file.buffer);
  res.json({ user });
}

export async function getUserAvatarHandler(req: Request, res: Response) {
  const filePath = usersService.resolveAvatarPath(req.params.userId);
  if (!existsSync(filePath)) throw new HttpError(404, 'Avatar not found');
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  createReadStream(filePath).pipe(res);
}
