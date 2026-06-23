import type { Request, Response } from 'express';
import { z } from 'zod';
import * as adminService from './admin.service.js';

const auditLogQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function listAuditLogsHandler(req: Request, res: Response) {
  const filters = auditLogQuerySchema.parse(req.query);
  const { logs, total } = await adminService.listAuditLogs(filters);
  res.json({ logs, total });
}

export async function getStatsHandler(_req: Request, res: Response) {
  const stats = await adminService.getStats();
  res.json({ stats });
}

export async function adminUpdateUserHandler(req: Request, res: Response) {
  const body = z
    .object({
      department: z.string().nullable().optional(),
      role: z.string().optional(),
      status: z.enum(['active', 'disabled']).optional(),
    })
    .parse(req.body);
  await adminService.adminUpdateUser(req.params.userId, body);
  res.status(204).send();
}

export async function adminDeleteUserHandler(req: Request, res: Response) {
  await adminService.adminDeleteUser(req.params.userId);
  res.status(204).send();
}

export async function syncDepartmentTeamsHandler(_req: Request, res: Response) {
  const result = await adminService.syncAllDepartmentTeams();
  res.json(result);
}
