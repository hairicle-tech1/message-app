import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../middleware/error.middleware.js';
import { writeAuditLog } from '../../utils/audit.js';
import * as authService from './auth.service.js';
import * as totpService from './totp.service.js';

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  deviceName: z.string().min(1).optional(),
});

const totpCodeSchema = z.object({ code: z.string().length(6) });

export async function loginHandler(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  try {
    const result = await authService.login(body.email, body.password, body.deviceName);
    const userId = 'user' in result ? (result.user as { id: string }).id : undefined;
    writeAuditLog('auth.login', { userId, ipAddress: req.ip, metadata: { email: body.email } });
    res.json(result);
  } catch (err) {
    writeAuditLog('auth.login_failed', { ipAddress: req.ip, metadata: { email: body.email } });
    throw err;
  }
}

export async function completeTotpLoginHandler(req: Request, res: Response) {
  const { totpToken, code, deviceName } = z
    .object({ totpToken: z.string(), code: z.string().length(6), deviceName: z.string().optional() })
    .parse(req.body);
  const result = await authService.completeTotpLogin(totpToken, code, deviceName);
  res.json(result);
}

export async function meHandler(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const user = await authService.getUserById(req.user.id);
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user });
}

export async function totpSetupHandler(req: Request, res: Response) {
  const user = await authService.getUserById(req.user!.id);
  if (!user) throw new HttpError(404, 'User not found');
  const setup = await totpService.generateTotpSetup(req.user!.id, user.email);
  res.json(setup);
}

export async function totpEnableHandler(req: Request, res: Response) {
  const { code } = totpCodeSchema.parse(req.body);
  await totpService.enableTotp(req.user!.id, code);
  writeAuditLog('auth.totp_enabled', { userId: req.user!.id, ipAddress: req.ip });
  res.json({ totpEnabled: true });
}

export async function totpDisableHandler(req: Request, res: Response) {
  const { code } = totpCodeSchema.parse(req.body);
  await totpService.disableTotp(req.user!.id, code);
  writeAuditLog('auth.totp_disabled', { userId: req.user!.id, ipAddress: req.ip });
  res.json({ totpEnabled: false });
}
