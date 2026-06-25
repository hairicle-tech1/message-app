import type { Request, Response } from 'express';
import { z } from 'zod';
import * as teamsService from './teams.service.js';

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'member']).optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export async function createTeamHandler(req: Request, res: Response) {
  const body = createTeamSchema.parse(req.body);
  const team = await teamsService.createTeam(req.user!.id, body);
  res.status(201).json({ team });
}

export async function listMyTeamsHandler(req: Request, res: Response) {
  const teams = await teamsService.listMyTeams(req.user!.id);
  res.json({ teams });
}

export async function getTeamHandler(req: Request, res: Response) {
  const team = await teamsService.getTeamById(req.params.id, req.user!.id);
  res.json({ team });
}

export async function updateTeamHandler(req: Request, res: Response) {
  const body = updateTeamSchema.parse(req.body);
  const team = await teamsService.updateTeam(req.params.id, req.user!.id, body);
  res.json({ team });
}

export async function deleteTeamHandler(req: Request, res: Response) {
  await teamsService.deleteTeam(req.params.id, req.user!.id);
  res.status(204).send();
}

export async function listTeamMembersHandler(req: Request, res: Response) {
  const members = await teamsService.listTeamMembers(req.params.id, req.user!.id);
  res.json({ members });
}

export async function addTeamMemberHandler(req: Request, res: Response) {
  const { userId, role } = addMemberSchema.parse(req.body);
  await teamsService.addTeamMember(req.params.id, req.user!.id, userId, role);
  res.status(204).send();
}

export async function removeTeamMemberHandler(req: Request, res: Response) {
  await teamsService.removeTeamMember(req.params.id, req.user!.id, req.params.userId);
  res.status(204).send();
}

export async function updateMemberRoleHandler(req: Request, res: Response) {
  const { role } = updateRoleSchema.parse(req.body);
  await teamsService.updateMemberRole(req.params.id, req.user!.id, req.params.userId, role);
  res.status(204).send();
}

export async function getTeamMessagesHandler(req: Request, res: Response) {
  const messages = await teamsService.getTeamMessages(req.params.id, req.user!.id);
  res.json({ messages });
}

export async function sendTeamMessageHandler(req: Request, res: Response) {
  const { content } = z.object({ content: z.string().min(1) }).parse(req.body);
  const message = await teamsService.sendTeamMessage(req.params.id, req.user!.id, content);
  res.status(201).json({ message });
}

export async function getTeamPinnedHandler(req: Request, res: Response) {
  const pinned = await teamsService.getTeamPinned(req.params.id, req.user!.id);
  res.json({ pinned });
}
