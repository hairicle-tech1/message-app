import { db } from '../../config/db.js';
import { syncUserTeams } from '../users/users.service.js';

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditLogFilters {
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listAuditLogs(filters: AuditLogFilters): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.userId) {
    params.push(filters.userId);
    conditions.push(`al.user_id = $${params.length}`);
  }
  if (filters.action) {
    params.push(filters.action);
    conditions.push(`al.action = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`al.created_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`al.created_at <= $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM audit_logs al ${where}`,
    params,
  );
  const total = Number(countResult.rows[0].total);

  params.push(limit, offset);
  const result = await db.query<{
    id: string;
    user_id: string | null;
    user_email: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    ip_address: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>(
    `SELECT al.id, al.user_id, u.email AS user_email, al.action,
            al.target_type, al.target_id, al.ip_address, al.metadata, al.created_at
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    total,
    logs: result.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      ipAddress: r.ip_address,
      metadata: r.metadata,
      createdAt: r.created_at,
    })),
  };
}

export async function getStats(): Promise<{
  totalUsers: number;
  activeUsers: number;
  totalMessages: number;
  messagesLast24h: number;
  totalConversations: number;
}> {
  const [users, messages, conversations] = await Promise.all([
    db.query<{ total: string; active: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'active') AS active
       FROM users`,
    ),
    db.query<{ total: string; last_24h: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS last_24h
       FROM messages WHERE deleted_at IS NULL`,
    ),
    db.query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM conversations',
    ),
  ]);

  return {
    totalUsers: Number(users.rows[0].total),
    activeUsers: Number(users.rows[0].active),
    totalMessages: Number(messages.rows[0].total),
    messagesLast24h: Number(messages.rows[0].last_24h),
    totalConversations: Number(conversations.rows[0].total),
  };
}

// Update any user's department, role, or status (admin action)
export async function adminUpdateUser(
  targetUserId: string,
  fields: { department?: string | null; role?: string; status?: 'active' | 'disabled' },
): Promise<void> {
  const setClauses: string[] = ['updated_at = now()'];
  const params: unknown[] = [];

  if (fields.department !== undefined) {
    params.push(fields.department ?? null);
    setClauses.push(`department = $${params.length}`);
  }
  if (fields.role !== undefined) {
    params.push(fields.role);
    setClauses.push(`role = $${params.length}`);
  }
  if (fields.status !== undefined) {
    params.push(fields.status);
    setClauses.push(`status = $${params.length}`);
  }
  if (params.length === 0) return;

  params.push(targetUserId);
  await db.query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
    params,
  );

  // Re-sync teams if department changed
  if (fields.department !== undefined) {
    const userRes = await db.query<{ role: string; department: string | null }>(
      'SELECT role, department FROM users WHERE id = $1',
      [targetUserId],
    );
    const u = userRes.rows[0];
    if (u) await syncUserTeams(targetUserId, u.role, u.department);
  }
}

export async function adminDeleteUser(targetUserId: string): Promise<void> {
  await db.query('DELETE FROM users WHERE id = $1', [targetUserId]);
}

// Backfill: assign ALL active users to their correct teams
// (department team + role team + All Employees)
export async function syncAllDepartmentTeams(): Promise<{ synced: number }> {
  const result = await db.query<{ id: string; role: string; department: string | null }>(
    `SELECT id, role, department FROM users WHERE status = 'active'`,
  );

  for (const row of result.rows) {
    await syncUserTeams(row.id, row.role, row.department);
  }

  return { synced: result.rows.length };
}
