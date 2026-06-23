import { db } from '../../config/db.js';
import { assignToDepartmentTeam } from '../users/users.service.js';

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

// Backfill: assign every existing user with a department to their team
export async function syncAllDepartmentTeams(): Promise<{ synced: number }> {
  const result = await db.query<{ id: string; department: string }>(
    `SELECT id, department FROM users WHERE department IS NOT NULL AND department != ''`,
  );

  for (const row of result.rows) {
    await assignToDepartmentTeam(row.id, row.department);
  }

  return { synced: result.rows.length };
}
