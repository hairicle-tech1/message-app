import type { Request, Response } from 'express';
import { z } from 'zod';
import { writeAuditLog } from '../../utils/audit.js';
import * as messagesService from './messages.service.js';

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(['text', 'image', 'video', 'audio', 'file', 'system']).optional(),
  ciphertext: z.string().optional(),
  replyToMessageId: z.string().uuid().optional(),
  fileId: z.string().uuid().optional(),
});

const listMessagesSchema = z.object({
  conversationId: z.string().uuid(),
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const editMessageSchema = z.object({
  ciphertext: z.string(),
});

export async function sendMessageHandler(req: Request, res: Response) {
  const body = sendMessageSchema.parse(req.body);
  const message = await messagesService.sendMessage(req.user!.id, body);
  res.status(201).json({ message });
}

export async function listMessagesHandler(req: Request, res: Response) {
  const query = listMessagesSchema.parse(req.query);
  const messages = await messagesService.getMessages(query.conversationId, req.user!.id, {
    before: query.before,
    limit: query.limit,
  });
  res.json({ messages });
}

const searchMessagesSchema = z.object({
  q: z.string().min(1).max(200),
  conversationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function searchMessagesHandler(req: Request, res: Response) {
  const { q, conversationId, limit, offset } = searchMessagesSchema.parse(req.query);
  const { results, total } = await messagesService.searchMessages(req.user!.id, q, {
    conversationId,
    limit,
    offset,
  });
  res.json({ results, total, query: q });
}

export async function markReadHandler(req: Request, res: Response) {
  await messagesService.markMessageRead(req.params.id, req.user!.id, req.user!.deviceId);
  res.status(204).send();
}

export async function editMessageHandler(req: Request, res: Response) {
  const body = editMessageSchema.parse(req.body);
  const message = await messagesService.editMessage(req.params.id, req.user!.id, body.ciphertext);
  res.json({ message });
}

export async function deleteMessageHandler(req: Request, res: Response) {
  const result = await messagesService.deleteMessage(req.params.id, req.user!.id);
  writeAuditLog('messages.deleted', {
    userId: req.user!.id,
    targetType: 'message',
    targetId: result.id,
    ipAddress: req.ip,
    metadata: { conversationId: result.conversationId },
  });
  res.json({ message: result });
}

export async function getReceiptsHandler(req: Request, res: Response) {
  const { receipts, memberCount } = await messagesService.getMessageReceipts(req.params.id, req.user!.id);
  res.json({ receipts, memberCount });
}

const addReactionSchema = z.object({
  emoji: z.string().min(1).max(10),
});

export async function addReactionHandler(req: Request, res: Response) {
  const { emoji } = addReactionSchema.parse(req.body);
  const reaction = await messagesService.addReaction(req.params.id, req.user!.id, emoji);
  res.status(201).json({ reaction });
}

export async function removeReactionHandler(req: Request, res: Response) {
  await messagesService.removeReaction(req.params.id, req.user!.id, req.params.emoji);
  res.status(204).send();
}
