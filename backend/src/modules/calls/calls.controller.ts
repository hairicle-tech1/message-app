import type { Request, Response } from 'express';
import { z } from 'zod';
import * as callsService from './calls.service.js';

const initiateSchema = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(['audio', 'video']),
});

export async function initiateCallHandler(req: Request, res: Response) {
  const { conversationId, type } = initiateSchema.parse(req.body);
  const call = await callsService.initiateCall(conversationId, req.user!.id, type);
  res.status(201).json({ call });
}

export async function joinCallHandler(req: Request, res: Response) {
  const call = await callsService.joinCall(req.params.id, req.user!.id);
  res.json({ call });
}

export async function leaveCallHandler(req: Request, res: Response) {
  const result = await callsService.leaveCall(req.params.id, req.user!.id);
  res.json(result);
}

export async function endCallHandler(req: Request, res: Response) {
  await callsService.endCall(req.params.id, req.user!.id);
  res.status(204).send();
}

export async function getCallHandler(req: Request, res: Response) {
  const call = await callsService.getCallById(req.params.id, req.user!.id);
  res.json({ call });
}

export async function getCallHistoryHandler(req: Request, res: Response) {
  const conversationId = z.string().uuid().parse(req.query.conversationId);
  const calls = await callsService.getCallHistory(conversationId, req.user!.id);
  res.json({ calls });
}
