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
