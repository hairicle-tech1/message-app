import { db } from '../../config/db.js';
import { HttpError } from '../../middleware/error.middleware.js';

// Runtime migrations — safe to re-run
void db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_message_id UUID REFERENCES messages(id) ON DELETE SET NULL`).catch(() => {});
void db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS original_sender_id UUID REFERENCES users(id) ON DELETE SET NULL`).catch(() => {});
void db.query(`
  CREATE TABLE IF NOT EXISTS user_bookmarks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, message_id)
  )
`).catch(() => {});
import { assertMember } from '../conversations/conversations.service.js';
import * as filesService from '../files/files.service.js';
import type { FileMeta } from '../files/files.service.js';
import { extractFirstUrl, fetchLinkPreview, saveLinkPreview } from './link-preview.service.js';
import { sendNewMessagePush } from '../../utils/push.js';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'system';

interface SendMessageInput {
  conversationId: string;
  type?: MessageType;
  ciphertext?: string;
  replyToMessageId?: string;
  fileId?: string;
}

export async function sendMessage(senderId: string, input: SendMessageInput) {
  const memberCheck = await db.query<{ role: string; conv_type: string; team_id: string | null }>(
    `SELECT cm.role, c.type AS conv_type, c.team_id
     FROM conversation_members cm
     JOIN conversations c ON c.id = cm.conversation_id
     WHERE cm.conversation_id = $1 AND cm.user_id = $2`,
    [input.conversationId, senderId],
  );
  const memberRow = memberCheck.rows[0];
  if (!memberRow) throw new HttpError(403, 'Not a member of this conversation');

  // Announce channels (no team_id): only owners/admins can broadcast.
  // Team workspace channels (has team_id): every team member can post — no role restriction.
  const isAnnounceChannel = memberRow.conv_type === 'channel' && !memberRow.team_id;
  if (isAnnounceChannel && memberRow.role === 'subscriber') {
    throw new HttpError(403, 'Only channel owners and admins can post in announcement channels');
  }

  const ciphertext = input.ciphertext ?? '';
  const ciphertextBuf = Buffer.from(ciphertext, 'base64');
  const type = input.type ?? 'text';

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const messageResult = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO messages (conversation_id, sender_id, type, ciphertext, reply_to_message_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [input.conversationId, senderId, type, ciphertextBuf, input.replyToMessageId ?? null],
    );
    const message = messageResult.rows[0];

    let file: FileMeta | undefined;
    if (input.fileId) {
      file = await filesService.attachFileToMessage(client, input.fileId, message.id, senderId);
    }

    const devicesResult = await client.query<{ id: string }>(
      `SELECT ud.id FROM user_devices ud
       JOIN conversation_members cm ON cm.user_id = ud.user_id
       WHERE cm.conversation_id = $1`,
      [input.conversationId],
    );

    for (const device of devicesResult.rows) {
      await client.query(
        `INSERT INTO message_deliveries (message_id, recipient_device_id, ciphertext, status)
         VALUES ($1, $2, $3, 'sent')`,
        [message.id, device.id, ciphertextBuf],
      );
    }

    await client.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [input.conversationId]);

    await client.query('COMMIT');

    const result = {
      id: message.id,
      conversationId: input.conversationId,
      senderId,
      type,
      ciphertext,
      replyToMessageId: input.replyToMessageId ?? null,
      createdAt: message.created_at,
      file,
    };

    // Fire-and-forget: link preview + push notifications (non-blocking)
    if (type === 'text' && ciphertext) {
      const plaintext = Buffer.from(ciphertext, 'base64').toString('utf8');
      const url = extractFirstUrl(plaintext);
      if (url) {
        void fetchLinkPreview(url).then((preview) => {
          if (preview) return saveLinkPreview(message.id, preview);
        });
      }
    }

    void sendNewMessagePush(message.id, input.conversationId, senderId, type, ciphertext);

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

interface GetMessagesOptions {
  before?: string;
  limit?: number;
}

export async function getMessages(conversationId: string, userId: string, options: GetMessagesOptions) {
  await assertMember(conversationId, userId);

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  const params: unknown[] = [conversationId];
  let whereClause = 'm.conversation_id = $1';

  if (options.before) {
    params.push(options.before);
    whereClause += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $${params.length})`;
  }

  params.push(limit);

  const result = await db.query(
    `SELECT m.id, m.conversation_id, m.sender_id, m.type, m.ciphertext, m.reply_to_message_id, m.forwarded_from_message_id, m.original_sender_id, m.created_at, m.edited_at, m.deleted_at,
            f.id AS file_id, f.file_name, f.mime_type, f.size_bytes, f.has_thumbnail, f.duration_secs AS file_duration_secs, f.created_at AS file_created_at,
            ou.display_name AS original_sender_display_name,
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'emoji', mr.emoji,
                 'userId', mr.user_id,
                 'username', ru.username,
                 'displayName', ru.display_name
               ) ORDER BY mr.created_at)
               FROM message_reactions mr
               JOIN users ru ON ru.id = mr.user_id
               WHERE mr.message_id = m.id),
              '[]'::json
            ) AS reactions,
            CASE WHEN m.deleted_at IS NULL THEN
              (SELECT row_to_json(lp) FROM (
                SELECT lp2.url, lp2.title, lp2.description, lp2.image_url AS "imageUrl", lp2.site_name AS "siteName"
                FROM link_previews lp2
                WHERE lp2.message_id = m.id
              ) lp)
            END AS link_preview
     FROM messages m
     LEFT JOIN files f ON f.message_id = m.id
     LEFT JOIN users ou ON ou.id = m.original_sender_id
     WHERE ${whereClause}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  return result.rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    type: row.type,
    ciphertext: row.deleted_at ? '' : Buffer.from(row.ciphertext).toString('base64'),
    replyToMessageId: row.reply_to_message_id,
    forwardedFromMessageId: (row as any).forwarded_from_message_id ?? null,
    forwardedFromDisplayName: (row as any).original_sender_id ? ((row as any).original_sender_display_name ?? 'Unknown') : null,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    reactions: row.reactions as { emoji: string; userId: string; username: string; displayName: string }[],
    linkPreview: (row.link_preview as { url: string; title: string | null; description: string | null; imageUrl: string | null; siteName: string | null } | null) ?? null,
    file:
      !row.deleted_at && row.file_id
        ? {
            id: row.file_id,
            fileName: row.file_name,
            mimeType: row.mime_type,
            sizeBytes: Number(row.size_bytes),
            hasThumbnail: row.has_thumbnail,
            durationSecs: row.file_duration_secs ?? null,
            createdAt: row.file_created_at,
          }
        : undefined,
  }));
}

export async function editMessage(messageId: string, userId: string, ciphertext: string) {
  const result = await db.query<{ conversation_id: string; sender_id: string; deleted_at: string | null }>(
    'SELECT conversation_id, sender_id, deleted_at FROM messages WHERE id = $1',
    [messageId],
  );
  const message = result.rows[0];
  if (!message) {
    throw new HttpError(404, 'Message not found');
  }
  if (message.sender_id !== userId) {
    throw new HttpError(403, 'Not authorized to edit this message');
  }
  if (message.deleted_at) {
    throw new HttpError(400, 'Cannot edit a deleted message');
  }

  const ciphertextBuf = Buffer.from(ciphertext, 'base64');

  const updated = await db.query<{ edited_at: string }>(
    `UPDATE messages SET ciphertext = $1, edited_at = now() WHERE id = $2 RETURNING edited_at`,
    [ciphertextBuf, messageId],
  );
  await db.query('UPDATE message_deliveries SET ciphertext = $1 WHERE message_id = $2', [ciphertextBuf, messageId]);

  return {
    id: messageId,
    conversationId: message.conversation_id,
    ciphertext,
    editedAt: updated.rows[0].edited_at,
  };
}

export async function deleteMessage(messageId: string, userId: string) {
  const result = await db.query<{ conversation_id: string; sender_id: string; requester_role: string }>(
    `SELECT m.conversation_id, m.sender_id, u.role AS requester_role
     FROM messages m
     JOIN users u ON u.id = $2
     WHERE m.id = $1`,
    [messageId, userId],
  );
  const message = result.rows[0];
  if (!message) {
    throw new HttpError(404, 'Message not found');
  }
  // Allow: the original sender, or any user with admin role
  const isSender = message.sender_id === userId;
  const isAdmin = message.requester_role === 'admin';
  if (!isSender && !isAdmin) {
    throw new HttpError(403, 'Not authorized to delete this message');
  }

  const updated = await db.query<{ deleted_at: string }>(
    `UPDATE messages SET deleted_at = now(), ciphertext = $1 WHERE id = $2 RETURNING deleted_at`,
    [Buffer.alloc(0), messageId],
  );
  await db.query('UPDATE message_deliveries SET ciphertext = $1 WHERE message_id = $2', [Buffer.alloc(0), messageId]);

  return { id: messageId, conversationId: message.conversation_id, deletedAt: updated.rows[0].deleted_at };
}

export interface SearchResult {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  type: string;
  ciphertext: string;
  createdAt: string;
  editedAt: string | null;
}

interface SearchOptions {
  conversationId?: string;
  limit?: number;
  offset?: number;
}

export async function searchMessages(
  userId: string,
  query: string,
  options: SearchOptions = {},
): Promise<{ results: SearchResult[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const pattern = `%${query.replace(/[%_\\]/g, '\\$&')}%`;

  const params: unknown[] = [userId, pattern];
  let scopeClause = `EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = m.conversation_id AND cm.user_id = $1
  )`;

  if (options.conversationId) {
    params.push(options.conversationId);
    scopeClause = `m.conversation_id = $${params.length} AND EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = $${params.length} AND cm.user_id = $1
    )`;
  }

  const baseWhere = `${scopeClause}
    AND m.deleted_at IS NULL
    AND m.type = 'text'
    AND convert_from(m.ciphertext, 'UTF8') ILIKE $2 ESCAPE '\\'`;

  const countResult = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM messages m WHERE ${baseWhere}`,
    params,
  );
  const total = Number(countResult.rows[0].total);

  params.push(limit, offset);
  const result = await db.query<{
    id: string;
    conversation_id: string;
    sender_id: string;
    sender_username: string;
    sender_display_name: string;
    type: string;
    ciphertext: Buffer;
    created_at: string;
    edited_at: string | null;
  }>(
    `SELECT m.id, m.conversation_id, m.sender_id, m.type, m.ciphertext, m.created_at, m.edited_at,
            u.username AS sender_username, u.display_name AS sender_display_name
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE ${baseWhere}
     ORDER BY m.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    total,
    results: result.rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      senderUsername: r.sender_username,
      senderDisplayName: r.sender_display_name,
      type: r.type,
      ciphertext: Buffer.from(r.ciphertext).toString('base64'),
      createdAt: r.created_at,
      editedAt: r.edited_at,
    })),
  };
}

export interface ReadReceipt {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  readAt: string;
}

export async function getMessageReceipts(messageId: string, requesterId: string): Promise<{
  receipts: ReadReceipt[];
  memberCount: number;
}> {
  // Verify message exists and requester is a member of its conversation
  const msgResult = await db.query<{ conversation_id: string; sender_id: string }>(
    'SELECT conversation_id, sender_id FROM messages WHERE id = $1',
    [messageId],
  );
  const msg = msgResult.rows[0];
  if (!msg) throw new HttpError(404, 'Message not found');
  await assertMember(msg.conversation_id, requesterId);

  // One receipt per user — use the earliest read_at across their devices
  const receiptsResult = await db.query<{
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    read_at: string;
  }>(
    `SELECT u.id AS user_id, u.username, u.display_name, u.avatar_url,
            MIN(md.read_at) AS read_at
     FROM message_deliveries md
     JOIN user_devices ud ON ud.id = md.recipient_device_id
     JOIN users u ON u.id = ud.user_id
     WHERE md.message_id = $1 AND md.status = 'read' AND u.id != $2
     GROUP BY u.id, u.username, u.display_name, u.avatar_url
     ORDER BY MIN(md.read_at) ASC`,
    [messageId, msg.sender_id],
  );

  const memberCountResult = await db.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM conversation_members WHERE conversation_id = $1',
    [msg.conversation_id],
  );
  const memberCount = Number(memberCountResult.rows[0]?.count ?? 0);

  return {
    receipts: receiptsResult.rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      readAt: r.read_at,
    })),
    memberCount,
  };
}

export async function markMessageRead(
  messageId: string,
  userId: string,
  deviceId: string,
): Promise<{ conversationId: string; readAt: string }> {
  const result = await db.query<{ conversation_id: string }>(
    'SELECT conversation_id FROM messages WHERE id = $1',
    [messageId],
  );
  const message = result.rows[0];
  if (!message) {
    throw new HttpError(404, 'Message not found');
  }

  await assertMember(message.conversation_id, userId);

  const updated = await db.query<{ read_at: string }>(
    `UPDATE message_deliveries SET status = 'read', read_at = now()
     WHERE message_id = $1 AND recipient_device_id = $2 AND status != 'read'
     RETURNING read_at`,
    [messageId, deviceId],
  );

  await db.query(
    `UPDATE conversation_members SET last_read_message_id = $1
     WHERE conversation_id = $2 AND user_id = $3`,
    [messageId, message.conversation_id, userId],
  );

  const readAt = updated.rows[0]?.read_at ?? new Date().toISOString();
  return { conversationId: message.conversation_id, readAt };
}

export interface Reaction {
  emoji: string;
  userId: string;
  username: string;
  displayName: string;
  createdAt: string;
}

async function getMessageConversation(messageId: string): Promise<{ conversationId: string }> {
  const result = await db.query<{ conversation_id: string }>(
    'SELECT conversation_id FROM messages WHERE id = $1',
    [messageId],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'Message not found');
  return { conversationId: row.conversation_id };
}

export async function addReaction(messageId: string, userId: string, emoji: string): Promise<Reaction & { conversationId: string }> {
  const { conversationId } = await getMessageConversation(messageId);
  await assertMember(conversationId, userId);

  await db.query(
    `INSERT INTO message_reactions (message_id, user_id, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
    [messageId, userId, emoji],
  );

  const userResult = await db.query<{ username: string; display_name: string; created_at: string }>(
    `SELECT u.username, u.display_name, mr.created_at
     FROM message_reactions mr
     JOIN users u ON u.id = mr.user_id
     WHERE mr.message_id = $1 AND mr.user_id = $2 AND mr.emoji = $3`,
    [messageId, userId, emoji],
  );
  const row = userResult.rows[0];

  return {
    emoji,
    userId,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
    conversationId,
  };
}

export async function removeReaction(messageId: string, userId: string, emoji: string): Promise<{ conversationId: string }> {
  const { conversationId } = await getMessageConversation(messageId);
  await assertMember(conversationId, userId);

  const result = await db.query(
    'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
    [messageId, userId, emoji],
  );
  if (result.rowCount === 0) throw new HttpError(404, 'Reaction not found');

  return { conversationId };
}

// ── Offline sync ──────────────────────────────────────────────────────────────

export async function getUndeliveredMessages(userId: string, deviceId: string) {
  // Returns messages delivered to this device that are still in 'sent' status
  // (i.e. the device was offline and hasn't acknowledged them yet)
  const result = await db.query<{
    id: string;
    conversation_id: string;
    sender_id: string;
    type: string;
    ciphertext: Buffer;
    reply_to_message_id: string | null;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
  }>(
    `SELECT m.id, m.conversation_id, m.sender_id, m.type, m.ciphertext,
            m.reply_to_message_id, m.created_at, m.edited_at, m.deleted_at
     FROM message_deliveries md
     JOIN messages m ON m.id = md.message_id
     JOIN user_devices ud ON ud.id = md.recipient_device_id
     WHERE md.recipient_device_id = $1
       AND ud.user_id = $2
       AND md.status = 'sent'
       AND m.deleted_at IS NULL
     ORDER BY m.created_at ASC
     LIMIT 200`,
    [deviceId, userId],
  );

  // Mark them as delivered now
  if (result.rows.length > 0) {
    await db.query(
      `UPDATE message_deliveries SET status = 'delivered', delivered_at = now()
       WHERE recipient_device_id = $1 AND status = 'sent'`,
      [deviceId],
    );
  }

  return result.rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    type: row.type,
    ciphertext: Buffer.from(row.ciphertext).toString('base64'),
    replyToMessageId: row.reply_to_message_id,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  }));
}

// ── Pin / Unpin ───────────────────────────────────────────────────────────────

export async function pinMessage(messageId: string, userId: string) {
  const { conversationId } = await getMessageConversation(messageId);
  await assertMember(conversationId, userId);
  await db.query(
    `INSERT INTO pinned_messages (conversation_id, message_id, pinned_by)
     VALUES ($1, $2, $3) ON CONFLICT (conversation_id, message_id) DO NOTHING`,
    [conversationId, messageId, userId],
  );
  return { conversationId, messageId };
}

export async function unpinMessage(messageId: string, userId: string) {
  const { conversationId } = await getMessageConversation(messageId);
  await assertMember(conversationId, userId);
  await db.query(
    'DELETE FROM pinned_messages WHERE conversation_id = $1 AND message_id = $2',
    [conversationId, messageId],
  );
  return { conversationId, messageId };
}

export async function getPinnedMessages(conversationId: string, userId: string) {
  await assertMember(conversationId, userId);
  const result = await db.query<{
    message_id: string; ciphertext: Buffer; type: string;
    sender_display_name: string | null; pinned_at: string; pinned_by_name: string | null;
  }>(
    `SELECT pm.message_id, m.ciphertext, m.type,
            u.display_name AS sender_display_name,
            pm.pinned_at,
            pb.display_name AS pinned_by_name
     FROM pinned_messages pm
     JOIN messages m ON m.id = pm.message_id
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN users pb ON pb.id = pm.pinned_by
     WHERE pm.conversation_id = $1
     ORDER BY pm.pinned_at DESC
     LIMIT 20`,
    [conversationId],
  );
  return result.rows.map((r) => ({
    messageId: r.message_id,
    type: r.type,
    ciphertext: Buffer.from(r.ciphertext).toString('base64'),
    senderDisplayName: r.sender_display_name ?? 'Unknown',
    pinnedAt: r.pinned_at,
    pinnedByName: r.pinned_by_name ?? 'Unknown',
  }));
}

// ── Personal bookmarks ────────────────────────────────────────────────────────

export async function bookmarkMessage(messageId: string, userId: string) {
  const { conversationId } = await getMessageConversation(messageId);
  await assertMember(conversationId, userId);
  await db.query(
    `INSERT INTO user_bookmarks (user_id, message_id, conversation_id)
     VALUES ($1, $2, $3) ON CONFLICT (user_id, message_id) DO NOTHING`,
    [userId, messageId, conversationId],
  );
  return { messageId };
}

export async function unbookmarkMessage(messageId: string, userId: string) {
  await db.query('DELETE FROM user_bookmarks WHERE user_id = $1 AND message_id = $2', [userId, messageId]);
  return { messageId };
}

export async function getUserBookmarks(userId: string, conversationId: string) {
  await assertMember(conversationId, userId);
  const result = await db.query<{
    message_id: string; ciphertext: Buffer; type: string;
    sender_display_name: string | null; created_at: string;
  }>(
    `SELECT ub.message_id, m.ciphertext, m.type,
            u.display_name AS sender_display_name, ub.created_at
     FROM user_bookmarks ub
     JOIN messages m ON m.id = ub.message_id
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE ub.user_id = $1 AND ub.conversation_id = $2 AND m.deleted_at IS NULL
     ORDER BY ub.created_at DESC
     LIMIT 50`,
    [userId, conversationId],
  );
  return result.rows.map((r) => ({
    messageId: r.message_id,
    type: r.type,
    ciphertext: Buffer.from(r.ciphertext).toString('base64'),
    senderDisplayName: r.sender_display_name ?? 'Unknown',
    savedAt: r.created_at,
  }));
}

// ── Forward ───────────────────────────────────────────────────────────────────

export async function forwardMessage(messageId: string, senderId: string, targetConversationId: string) {
  await assertMember(targetConversationId, senderId);

  // Fetch source message + its original_sender_id (for chain preservation) + sender fallback
  const src = await db.query<{
    ciphertext: Buffer; type: string; file_id: string | null;
    sender_id: string | null; original_sender_id: string | null;
    original_sender_display_name: string | null; sender_display_name: string | null;
  }>(
    `SELECT m.ciphertext, m.type, f.id AS file_id,
            m.sender_id, m.original_sender_id,
            ou.display_name AS original_sender_display_name,
            su.display_name AS sender_display_name
     FROM messages m
     LEFT JOIN files f ON f.message_id = m.id
     LEFT JOIN users ou ON ou.id = m.original_sender_id
     LEFT JOIN users su ON su.id = m.sender_id
     WHERE m.id = $1 AND m.deleted_at IS NULL`,
    [messageId],
  );
  const original = src.rows[0];
  if (!original) throw new HttpError(404, 'Original message not found or deleted');

  // Preserve original attribution through chains:
  // If the source is already a forward, its original_sender_id is the true origin.
  // Otherwise, the source's own sender is the origin.
  const originalSenderId = original.original_sender_id ?? original.sender_id;
  const originalSenderName = original.original_sender_id
    ? (original.original_sender_display_name ?? 'Unknown')
    : (original.sender_display_name ?? 'Unknown');

  const ciphertext = original.ciphertext.toString('base64');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const msgResult = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO messages (conversation_id, sender_id, type, ciphertext, forwarded_from_message_id, original_sender_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
      [targetConversationId, senderId, original.type, original.ciphertext, messageId, originalSenderId],
    );
    const newMsg = msgResult.rows[0];

    if (original.file_id) {
      await client.query(
        `INSERT INTO files (id, storage_key, file_name, mime_type, size_bytes, has_thumbnail, uploader_id, message_id, duration_secs)
         SELECT uuid_generate_v4(), storage_key, file_name, mime_type, size_bytes, has_thumbnail, $1, $2, duration_secs
         FROM files WHERE id = $3`,
        [senderId, newMsg.id, original.file_id],
      );
    }

    await client.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [targetConversationId]);
    await client.query('COMMIT');

    return {
      id: newMsg.id,
      conversationId: targetConversationId,
      senderId,
      type: original.type as MessageType,
      ciphertext,
      replyToMessageId: null,
      forwardedFromMessageId: messageId,
      forwardedFromDisplayName: originalSenderName,
      createdAt: newMsg.created_at,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
