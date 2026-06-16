import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../middleware/error.middleware.js';
import * as filesService from '../files/files.service.js';
import * as conversationsService from './conversations.service.js';

const createConversationSchema = z.object({
  type: z.enum(['direct', 'group', 'channel']),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  memberIds: z.array(z.string().uuid()).default([]),
});

const memberSchema = z.object({
  userId: z.string().uuid(),
});

export async function createConversationHandler(req: Request, res: Response) {
  const body = createConversationSchema.parse(req.body);
  const conversation = await conversationsService.createConversation(req.user!.id, body);
  res.status(201).json({ conversation });
}

export async function listConversationsHandler(req: Request, res: Response) {
  const conversations = await conversationsService.listConversations(req.user!.id);
  res.json({ conversations });
}

export async function getConversationHandler(req: Request, res: Response) {
  const conversation = await conversationsService.getConversationById(req.params.id, req.user!.id);
  res.json({ conversation });
}

export async function getConversationMediaHandler(req: Request, res: Response) {
  const media = await filesService.getConversationMedia(req.params.id, req.user!.id);
  res.json({ media });
}

export async function getConversationAttachmentsHandler(req: Request, res: Response) {
  const typesParam = req.query.types as string | undefined;
  const types = typesParam ? typesParam.split(',') : ['file', 'audio'];
  const items = await filesService.getConversationAttachments(req.params.id, req.user!.id, types);
  res.json({ items });
}

export async function addMemberHandler(req: Request, res: Response) {
  const body = memberSchema.parse(req.body);
  await conversationsService.addMember(req.params.id, req.user!.id, body.userId);
  res.status(204).send();
}

export async function removeMemberHandler(req: Request, res: Response) {
  const targetUserId = req.params.userId;
  if (!targetUserId) {
    throw new HttpError(400, 'Missing userId');
  }
  await conversationsService.removeMember(req.params.id, req.user!.id, targetUserId);
  res.status(204).send();
}

export async function muteConversationHandler(req: Request, res: Response) {
  const body = z
    .object({ duration: z.enum(['hour', 'day', 'week', 'forever']) })
    .parse(req.body);
  const result = await conversationsService.muteConversation(req.params.id, req.user!.id, body.duration);
  res.json(result);
}

export async function unmuteConversationHandler(req: Request, res: Response) {
  const result = await conversationsService.unmuteConversation(req.params.id, req.user!.id);
  res.json(result);
}

export async function getMuteStatusHandler(req: Request, res: Response) {
  const result = await conversationsService.getMuteStatus(req.params.id, req.user!.id);
  res.json(result);
}
