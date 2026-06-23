import { existsSync, mkdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcrypt';
import sharp from 'sharp';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/error.middleware.js';

const avatarsRoot = path.resolve(env.uploadsDir, 'avatars');

const AVATAR_SIZE = 256;

interface CreateUserInput {
  email: string;
  username: string;
  displayName: string;
  password: string;
  department?: string;
  role?: 'employee' | 'admin';
}

// ── Department → Team auto-assignment ────────────────────────────────────────

async function findOrCreateDepartmentTeam(department: string, userId: string): Promise<string> {
  // Try to find an existing team whose name matches the department
  const existing = await db.query<{ id: string }>(
    'SELECT id FROM teams WHERE name = $1 LIMIT 1',
    [department],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  // Create the team on first occurrence — the triggering user becomes creator
  const created = await db.query<{ id: string }>(
    `INSERT INTO teams (name, description, created_by)
     VALUES ($1, $2, $3) RETURNING id`,
    [department, `${department} department`, userId],
  );
  return created.rows[0].id;
}

export async function assignToDepartmentTeam(userId: string, department: string | null | undefined): Promise<void> {
  if (!department) return;
  const teamId = await findOrCreateDepartmentTeam(department, userId);
  await db.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (team_id, user_id) DO NOTHING`,
    [teamId, userId],
  );
}

async function removeFromDepartmentTeam(userId: string, department: string): Promise<void> {
  // Only remove if this team was auto-created for the department (name matches)
  await db.query(
    `DELETE FROM team_members
     WHERE user_id = $1
       AND team_id = (SELECT id FROM teams WHERE name = $2 LIMIT 1)`,
    [userId, department],
  );
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, 12);

  const result = await db.query<{ id: string }>(
    `INSERT INTO users (email, username, display_name, password_hash, department, role)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'employee'))
     RETURNING id, email, username, display_name, role, department, status, created_at`,
    [input.email, input.username, input.displayName, passwordHash, input.department ?? null, input.role ?? null],
  );

  const user = result.rows[0];
  // Auto-add to department team
  await assignToDepartmentTeam(user.id, input.department);

  return user;
}

export async function listUsers() {
  const result = await db.query(
    'SELECT id, email, username, display_name, role, department, status, created_at FROM users ORDER BY created_at DESC',
  );
  return result.rows;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  department: string | null;
  role: string;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const result = await db.query<{
    id: string; email: string; username: string; display_name: string;
    avatar_url: string | null; department: string | null; role: string;
  }>(
    'SELECT id, email, username, display_name, avatar_url, department, role FROM users WHERE id = $1',
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    department: row.department,
    role: row.role,
  };
}

export async function updateProfile(userId: string, fields: { displayName?: string; department?: string | null }): Promise<UserProfile> {
  // Fetch current department before updating (needed for team re-assignment)
  let oldDepartment: string | null = null;
  if (fields.department !== undefined) {
    const cur = await db.query<{ department: string | null }>('SELECT department FROM users WHERE id = $1', [userId]);
    oldDepartment = cur.rows[0]?.department ?? null;
  }

  const setClauses: string[] = ['updated_at = now()'];
  const params: unknown[] = [];

  if (fields.displayName !== undefined) {
    params.push(fields.displayName);
    setClauses.push(`display_name = $${params.length}`);
  }
  if (fields.department !== undefined) {
    params.push(fields.department || null);
    setClauses.push(`department = $${params.length}`);
  }

  params.push(userId);
  const result = await db.query<{
    id: string; email: string; username: string; display_name: string;
    avatar_url: string | null; department: string | null; role: string;
  }>(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${params.length}
     RETURNING id, email, username, display_name, avatar_url, department, role`,
    params,
  );
  const row = result.rows[0];

  // Sync department team membership when department changes
  if (fields.department !== undefined && oldDepartment !== (fields.department || null)) {
    if (oldDepartment) await removeFromDepartmentTeam(userId, oldDepartment);
    if (fields.department) await assignToDepartmentTeam(userId, fields.department);
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    department: row.department,
    role: row.role,
  };
}

export async function updateAvatar(userId: string, buffer: Buffer): Promise<UserProfile> {
  if (!existsSync(avatarsRoot)) mkdirSync(avatarsRoot, { recursive: true });

  const webp = await sharp(buffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();

  const filePath = path.join(avatarsRoot, `${userId}.webp`);
  await fs.writeFile(filePath, webp);

  const avatarUrl = `/api/users/${userId}/avatar`;
  const result = await db.query<{
    id: string; email: string; username: string; display_name: string;
    avatar_url: string | null; department: string | null; role: string;
  }>(
    `UPDATE users SET avatar_url = $1, updated_at = now() WHERE id = $2
     RETURNING id, email, username, display_name, avatar_url, department, role`,
    [avatarUrl, userId],
  );

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    department: row.department,
    role: row.role,
  };
}

export function resolveAvatarPath(userId: string): string {
  return path.join(avatarsRoot, `${userId}.webp`);
}

export interface NotificationPrefs {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  emailEnabled: boolean;
}

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const result = await db.query<{
    sound_enabled: boolean;
    desktop_enabled: boolean;
    email_enabled: boolean;
  }>(
    'SELECT sound_enabled, desktop_enabled, email_enabled FROM notification_preferences WHERE user_id = $1',
    [userId],
  );
  const row = result.rows[0];
  // Return defaults if no row yet (prefs are created lazily on first PATCH)
  return {
    soundEnabled: row?.sound_enabled ?? true,
    desktopEnabled: row?.desktop_enabled ?? true,
    emailEnabled: row?.email_enabled ?? false,
  };
}

export async function updateNotificationPrefs(
  userId: string,
  fields: { soundEnabled?: boolean; desktopEnabled?: boolean; emailEnabled?: boolean },
): Promise<NotificationPrefs> {
  const result = await db.query<{
    sound_enabled: boolean;
    desktop_enabled: boolean;
    email_enabled: boolean;
  }>(
    `INSERT INTO notification_preferences (user_id, sound_enabled, desktop_enabled, email_enabled)
     VALUES ($1, COALESCE($2, TRUE), COALESCE($3, TRUE), COALESCE($4, FALSE))
     ON CONFLICT (user_id) DO UPDATE SET
       sound_enabled   = COALESCE($2, notification_preferences.sound_enabled),
       desktop_enabled = COALESCE($3, notification_preferences.desktop_enabled),
       email_enabled   = COALESCE($4, notification_preferences.email_enabled),
       updated_at      = now()
     RETURNING sound_enabled, desktop_enabled, email_enabled`,
    [userId, fields.soundEnabled ?? null, fields.desktopEnabled ?? null, fields.emailEnabled ?? null],
  );
  const row = result.rows[0];
  return {
    soundEnabled: row.sound_enabled,
    desktopEnabled: row.desktop_enabled,
    emailEnabled: row.email_enabled,
  };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const result = await db.query<{ password_hash: string | null }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId],
  );
  const row = result.rows[0];
  if (!row?.password_hash) throw new HttpError(400, 'No password set on this account');

  const valid = await bcrypt.compare(currentPassword, row.password_hash);
  if (!valid) throw new HttpError(403, 'Current password is incorrect');

  const newHash = await bcrypt.hash(newPassword, 12);
  await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [newHash, userId]);
}

export async function registerPushToken(userId: string, deviceId: string, token: string): Promise<void> {
  const result = await db.query(
    'UPDATE user_devices SET push_token = $1 WHERE id = $2 AND user_id = $3',
    [token, deviceId, userId],
  );
  if (result.rowCount === 0) {
    throw new HttpError(404, 'Device not found or does not belong to this user');
  }
}

export async function clearPushToken(userId: string, deviceId: string): Promise<void> {
  await db.query(
    'UPDATE user_devices SET push_token = NULL WHERE id = $1 AND user_id = $2',
    [deviceId, userId],
  );
}

export async function listDirectory(excludeUserId: string) {
  const result = await db.query(
    `SELECT id, username, display_name, avatar_url, department
     FROM users
     WHERE status = 'active' AND id != $1
     ORDER BY display_name`,
    [excludeUserId],
  );
  return result.rows;
}
