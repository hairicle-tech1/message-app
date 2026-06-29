import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/error.middleware.js';
import { ldapAuthenticate, upsertLdapUser } from './ldap.service.js';
import { verifyTotpCode } from './totp.service.js';

interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  role: string;
  status: string;
  password_hash: string | null;
  ldap_dn: string | null;
  totp_secret: string | null;
  totp_enabled: boolean;
}

function issueFullToken(user: { id: string; email: string; role: string }, deviceId: string): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, deviceId },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn } as jwt.SignOptions,
  );
}

function issueTotpPendingToken(userId: string): string {
  return jwt.sign(
    { sub: userId, scope: 'totp_pending' },
    env.jwtSecret,
    { expiresIn: '5m' },
  );
}

export async function login(
  email: string,
  password: string,
  deviceName = 'default',
): Promise<
  | { requiresTotp: true; totpToken: string }
  | { requiresTotp: false; token: string; deviceId: string; user: object }
> {
  let userId: string;
  let userEmail: string;
  let userRole: string;
  let totpSecret: string | null;
  let totpEnabled: boolean;

  // ── Try LDAP first if configured ────────────────────────────────────────────
  if (env.ldapUrl) {
    const username = email.includes('@') ? email.split('@')[0] : email;
    const ldapUser = await ldapAuthenticate(username, password);

    if (ldapUser) {
      const upserted = await upsertLdapUser(ldapUser);
      const row = await db.query<UserRow>(
        `SELECT id, email, username, display_name, role, status, password_hash,
                ldap_dn, totp_secret, totp_enabled
         FROM users WHERE id = $1`,
        [upserted.id],
      );
      const user = row.rows[0];
      if (user.status !== 'active') throw new HttpError(403, 'Account is disabled');

      userId = user.id;
      userEmail = user.email;
      userRole = user.role;
      totpSecret = user.totp_secret;
      totpEnabled = user.totp_enabled;
    } else {
      // LDAP configured but auth failed — fall through to local
      throw new HttpError(401, 'Invalid credentials');
    }
  } else {
    // ── Local password auth ──────────────────────────────────────────────────
    const result = await db.query<UserRow>(
      `SELECT id, email, username, display_name, role, status, password_hash,
              ldap_dn, totp_secret, totp_enabled
       FROM users WHERE email = $1`,
      [email],
    );
    const user = result.rows[0];

    if (!user || !user.password_hash) {
      throw new HttpError(401, 'Invalid email or password');
    }
    if (user.status !== 'active') throw new HttpError(403, 'Account is disabled');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new HttpError(401, 'Invalid email or password');

    userId = user.id;
    userEmail = user.email;
    userRole = user.role;
    totpSecret = user.totp_secret;
    totpEnabled = user.totp_enabled;
  }

  // ── 2FA gate ────────────────────────────────────────────────────────────────
  if (totpEnabled && totpSecret) {
    return { requiresTotp: true, totpToken: issueTotpPendingToken(userId) };
  }

  const deviceId = await getOrCreateDevice(userId, deviceName);
  const token = issueFullToken({ id: userId, email: userEmail, role: userRole }, deviceId);

  const userRow = await db.query<{ id: string; email: string; username: string; display_name: string; role: string }>(
    'SELECT id, email, username, display_name, role FROM users WHERE id = $1',
    [userId],
  );
  const u = userRow.rows[0];

  return {
    requiresTotp: false,
    token,
    deviceId,
    user: { id: u.id, email: u.email, username: u.username, displayName: u.display_name, role: u.role },
  };
}

export async function completeTotpLogin(
  totpToken: string,
  code: string,
  deviceName = 'default',
): Promise<{ token: string; deviceId: string; user: object }> {
  let payload: { sub: string; scope: string };
  try {
    payload = jwt.verify(totpToken, env.jwtSecret) as typeof payload;
  } catch {
    throw new HttpError(401, 'Invalid or expired TOTP session token');
  }
  if (payload.scope !== 'totp_pending') throw new HttpError(401, 'Invalid token scope');

  const result = await db.query<{
    id: string; email: string; username: string; display_name: string;
    role: string; status: string; totp_secret: string | null; totp_enabled: boolean;
  }>(
    'SELECT id, email, username, display_name, role, status, totp_secret, totp_enabled FROM users WHERE id = $1',
    [payload.sub],
  );
  const user = result.rows[0];
  if (!user || user.status !== 'active') throw new HttpError(401, 'Account not found or disabled');
  if (!user.totp_enabled || !user.totp_secret) throw new HttpError(400, '2FA is not enabled on this account');

  if (!verifyTotpCode(user.totp_secret, user.email, code)) {
    throw new HttpError(401, 'Invalid TOTP code');
  }

  const deviceId = await getOrCreateDevice(user.id, deviceName);
  const token = issueFullToken({ id: user.id, email: user.email, role: user.role }, deviceId);

  return {
    token,
    deviceId,
    user: { id: user.id, email: user.email, username: user.username, displayName: user.display_name, role: user.role },
  };
}

async function getOrCreateDevice(userId: string, deviceName: string): Promise<string> {
  const existing = await db.query<{ id: string }>(
    'SELECT id FROM user_devices WHERE user_id = $1 AND device_name = $2',
    [userId, deviceName],
  );

  if (existing.rows[0]) {
    await db.query('UPDATE user_devices SET last_active_at = now() WHERE id = $1', [existing.rows[0].id]);
    return existing.rows[0].id;
  }

  const created = await db.query<{ id: string }>(
    `INSERT INTO user_devices (user_id, device_name, last_active_at)
     VALUES ($1, $2, now()) RETURNING id`,
    [userId, deviceName],
  );
  return created.rows[0].id;
}

export async function getUserById(id: string) {
  const result = await db.query<{
    id: string; email: string; username: string; display_name: string; role: string; avatar_url: string | null;
  }>(
    'SELECT id, email, username, display_name, role, avatar_url FROM users WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    avatarUrl: row.avatar_url,
  };
}
