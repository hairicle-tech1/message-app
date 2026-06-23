import { db } from '../config/db.js';

export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.totp_enabled'
  | 'auth.totp_disabled'
  | 'auth.password_changed'
  | 'users.created'
  | 'users.disabled'
  | 'messages.deleted'
  | 'messages.edited';

interface AuditOptions {
  userId?: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export function writeAuditLog(action: AuditAction, opts: AuditOptions = {}): void {
  // Fire-and-forget — never blocks, never throws
  void db
    .query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        opts.userId ?? null,
        action,
        opts.targetType ?? null,
        opts.targetId ?? null,
        opts.ipAddress ?? null,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
      ],
    )
    .catch(() => { /* intentionally silent */ });
}
