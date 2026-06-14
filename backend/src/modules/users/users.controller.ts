import type { Request, Response } from 'express';
import { z } from 'zod';
import * as usersService from './users.service.js';

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
