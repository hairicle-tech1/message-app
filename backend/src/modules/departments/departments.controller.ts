import type { Request, Response } from 'express';
import { z } from 'zod';
import * as deptService from './departments.service.js';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(300).nullable().optional(),
});

export async function listDepartmentsHandler(_req: Request, res: Response) {
  const departments = await deptService.listDepartments();
  res.json({ departments });
}

export async function createDepartmentHandler(req: Request, res: Response) {
  const { name, description } = createSchema.parse(req.body);
  const department = await deptService.createDepartment(name, description);
  res.status(201).json({ department });
}

export async function updateDepartmentHandler(req: Request, res: Response) {
  const fields = updateSchema.parse(req.body);
  const department = await deptService.updateDepartment(req.params.id, fields);
  res.json({ department });
}

export async function deleteDepartmentHandler(req: Request, res: Response) {
  await deptService.deleteDepartment(req.params.id);
  res.status(204).send();
}
