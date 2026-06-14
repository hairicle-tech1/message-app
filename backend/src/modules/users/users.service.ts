import bcrypt from 'bcrypt';
import { db } from '../../config/db.js';

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
