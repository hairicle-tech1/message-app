import { db } from '../../config/db.js';
import { HttpError } from '../../middleware/error.middleware.js';
import { assertMember } from '../conversations/conversations.service.js';
import * as filesService from '../files/files.service.js';
import type { FileMeta } from '../files/files.service.js';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'system';

interface SendMessageInput {
  conversationId: string;
  type?: MessageType;
  ciphertext?: string;
  replyToMessageId?: string;
  fileId?: string;
}

export async function sendMessage(senderId: string, input: SendMessageInput) {
  await assertMember(input.conversationId, senderId);

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

    return {
      id: message.id,
      conversationId: input.conversationId,
      senderId,
      type,
      ciphertext,
      replyToMessageId: input.replyToMessageId ?? null,
      createdAt: message.created_at,
      file,
    };
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
  let whereClause = 'm.conversation_id = $1 AND m.deleted_at IS NULL';

  if (options.before) {
    params.push(options.before);
    whereClause += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $${params.length})`;
  }

  params.push(limit);

  const result = await db.query(
    `SELECT m.id, m.conversation_id, m.sender_id, m.type, m.ciphertext, m.reply_to_message_id, m.created_at, m.edited_at,
            f.id AS file_id, f.file_name, f.mime_type, f.size_bytes, f.created_at AS file_created_at
     FROM messages m
     LEFT JOIN files f ON f.message_id = m.id
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
    ciphertext: Buffer.from(row.ciphertext).toString('base64'),
    replyToMessageId: row.reply_to_message_id,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    file: row.file_id
      ? {
          id: row.file_id,
          fileName: row.file_name,
          mimeType: row.mime_type,
          sizeBytes: Number(row.size_bytes),
          createdAt: row.file_created_at,
        }
      : undefined,
  }));
}

export async function markMessageRead(messageId: string, userId: string, deviceId: string) {
  const result = await db.query<{ conversation_id: string }>(
    'SELECT conversation_id FROM messages WHERE id = $1',
    [messageId],
  );
  const message = result.rows[0];
  if (!message) {
    throw new HttpError(404, 'Message not found');
  }

  await assertMember(message.conversation_id, userId);

  await db.query(
    `UPDATE message_deliveries SET status = 'read', read_at = now()
     WHERE message_id = $1 AND recipient_device_id = $2 AND status != 'read'`,
    [messageId, deviceId],
  );

  await db.query(
    `UPDATE conversation_members SET last_read_message_id = $1
     WHERE conversation_id = $2 AND user_id = $3`,
    [messageId, message.conversation_id, userId],
  );
}
