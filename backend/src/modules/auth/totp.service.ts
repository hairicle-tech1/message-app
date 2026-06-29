import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/error.middleware.js';

function makeTOTP(secret: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: env.totpIssuer,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export async function generateTotpSetup(userId: string, email: string) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const secretBase32 = secret.base32;

  const totp = makeTOTP(secretBase32, email);
  const otpauthUrl = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Save the secret (not yet enabled — user must verify first)
  await db.query(
    'UPDATE users SET totp_secret = $1, totp_enabled = FALSE, updated_at = now() WHERE id = $2',
    [secretBase32, userId],
  );

  return { secret: secretBase32, otpauthUrl, qrCodeDataUrl };
}

export function verifyTotpCode(secret: string, email: string, code: string): boolean {
  const totp = makeTOTP(secret, email);
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export async function enableTotp(userId: string, code: string): Promise<void> {
  const result = await db.query<{ totp_secret: string | null; email: string }>(
    'SELECT totp_secret, email FROM users WHERE id = $1',
    [userId],
  );
  const row = result.rows[0];
  if (!row?.totp_secret) throw new HttpError(400, 'Run TOTP setup first');

  if (!verifyTotpCode(row.totp_secret, row.email, code)) {
    throw new HttpError(400, 'Invalid TOTP code');
  }

  await db.query(
    'UPDATE users SET totp_enabled = TRUE, updated_at = now() WHERE id = $1',
    [userId],
  );
}

export async function disableTotp(userId: string, code: string): Promise<void> {
  const result = await db.query<{ totp_secret: string | null; totp_enabled: boolean; email: string }>(
    'SELECT totp_secret, totp_enabled, email FROM users WHERE id = $1',
    [userId],
  );
  const row = result.rows[0];
  if (!row?.totp_enabled) throw new HttpError(400, '2FA is not enabled');

  if (!verifyTotpCode(row.totp_secret!, row.email, code)) {
    throw new HttpError(400, 'Invalid TOTP code');
  }

  await db.query(
    'UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, updated_at = now() WHERE id = $1',
    [userId],
  );
}
