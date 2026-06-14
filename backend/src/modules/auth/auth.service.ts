import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/error.middleware.js';

interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  role: string;
  status: string;
  password_hash: string | null;
}

export async function login(email: string, password: string, deviceName = 'default') {
  const result = await db.query<UserRow>(
    'SELECT id, email, username, display_name, role, status, password_hash FROM users WHERE email = $1',
    [email],
  );
  const user = result.rows[0];

  if (!user || !user.password_hash) {
    throw new HttpError(401, 'Invalid email or password');
  }

  if (user.status !== 'active') {
    throw new HttpError(403, 'Account is disabled');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const deviceId = await getOrCreateDevice(user.id, deviceName);

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, deviceId },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn } as jwt.SignOptions,
  );

  return {
    token,
    deviceId,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    },
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
  const result = await db.query(
    'SELECT id, email, username, display_name, role, department, status, avatar_url FROM users WHERE id = $1',
    [id],
  );
  return result.rows[0] ?? null;
}
