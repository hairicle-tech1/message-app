import { existsSync, mkdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcrypt';
import sharp from 'sharp';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';

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

export async function createUser(input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, 12);

  const result = await db.query(
    `INSERT INTO users (email, username, display_name, password_hash, department, role)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'employee'))
     RETURNING id, email, username, display_name, role, department, status, created_at`,
    [input.email, input.username, input.displayName, passwordHash, input.department ?? null, input.role ?? null],
  );

  return result.rows[0];
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
