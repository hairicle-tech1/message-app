import { db } from '../../config/db.js';
import { HttpError } from '../../middleware/error.middleware.js';

export type ConversationType = 'direct' | 'group' | 'channel';

interface CreateConversationInput {
  type: ConversationType;
  name?: string;
  description?: string;
  memberIds: string[];
}

export async function createConversation(creatorId: string, input: CreateConversationInput) {
  if (input.type === 'direct') {
    if (input.memberIds.length !== 1) {
      throw new HttpError(400, 'Direct conversations require exactly one other member');
    }

    const otherId = input.memberIds[0];
    if (otherId === creatorId) {
      throw new HttpError(400, 'Cannot create a direct conversation with yourself');
    }

    const existing = await db.query<{ id: string }>(
      `SELECT c.id FROM conversations c
       JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = $1
       JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = $2
       WHERE c.type = 'direct'
       LIMIT 1`,
      [creatorId, otherId],
    );

    if (existing.rows[0]) {
      return getConversationById(existing.rows[0].id, creatorId);
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const convResult = await client.query(
      `INSERT INTO conversations (type, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.type, input.name ?? null, input.description ?? null, creatorId],
    );
    const conversationId: string = convResult.rows[0].id;

    const memberIds = new Set([creatorId, ...input.memberIds]);
    for (const userId of memberIds) {
      const role = userId === creatorId ? 'owner' : input.type === 'channel' ? 'subscriber' : 'member';
      await client.query(
        `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, $3)`,
        [conversationId, userId, role],
      );
    }

    await client.query('COMMIT');
    return getConversationById(conversationId, creatorId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listConversations(userId: string) {
  const result = await db.query(
    `SELECT c.*,
       cm.muted_until,
       (cm.muted_until IS NOT NULL AND cm.muted_until > now()) AS is_muted,
       -- Unread count: messages after the user's last read message
       (SELECT COUNT(*)
        FROM messages m_unread
        WHERE m_unread.conversation_id = c.id
          AND m_unread.deleted_at IS NULL
          AND m_unread.sender_id != $1
          AND (
            cm.last_read_message_id IS NULL
            OR m_unread.created_at > (
              SELECT created_at FROM messages WHERE id = cm.last_read_message_id
            )
          )
       )::int AS unread_count,
       -- Last message preview for sidebar
       (SELECT row_to_json(lm) FROM (
          SELECT m_last.id,
                 m_last.sender_id,
                 m_last.type,
                 CASE WHEN m_last.deleted_at IS NOT NULL THEN ''
                      ELSE encode(m_last.ciphertext, 'base64')
                 END AS ciphertext,
                 m_last.deleted_at,
                 m_last.created_at,
                 u_last.username     AS sender_username,
                 u_last.display_name AS sender_display_name
          FROM messages m_last
          JOIN users u_last ON u_last.id = m_last.sender_id
          WHERE m_last.conversation_id = c.id
          ORDER BY m_last.created_at DESC
          LIMIT 1
        ) lm
       ) AS last_message,
       (SELECT json_agg(json_build_object(
          'user_id', cm2.user_id,
          'role', cm2.role,
          'joined_at', cm2.joined_at,
          'username', u.username,
          'display_name', u.display_name,
          'avatar_url', u.avatar_url
        ))
        FROM conversation_members cm2
        JOIN users u ON u.id = cm2.user_id
        WHERE cm2.conversation_id = c.id) AS members
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id
     WHERE cm.user_id = $1
     ORDER BY c.updated_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function getConversationById(conversationId: string, userId: string) {
  const convResult = await db.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
  const conversation = convResult.rows[0];
  if (!conversation) {
    throw new HttpError(404, 'Conversation not found');
  }

  const membersResult = await db.query(
    `SELECT cm.user_id, cm.role, cm.joined_at, cm.muted_until,
            u.username, u.display_name, u.avatar_url
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = $1`,
    [conversationId],
  );

  const currentMember = membersResult.rows.find((m) => m.user_id === userId);
  if (!currentMember) {
    throw new HttpError(403, 'Not a member of this conversation');
  }

  const mutedUntil = currentMember.muted_until ?? null;
  const isMuted = mutedUntil !== null && new Date(mutedUntil) > new Date();

  return { ...conversation, mutedUntil, isMuted, members: membersResult.rows };
}

export async function addMember(conversationId: string, requesterId: string, targetUserId: string) {
  const conv = await db.query<{ type: ConversationType }>('SELECT type FROM conversations WHERE id = $1', [
    conversationId,
  ]);
  if (!conv.rows[0]) {
    throw new HttpError(404, 'Conversation not found');
  }
  if (conv.rows[0].type === 'direct') {
    throw new HttpError(400, 'Cannot add members to a direct conversation');
  }

  await requireOwnerOrAdmin(conversationId, requesterId);

  const role = conv.rows[0].type === 'channel' ? 'subscriber' : 'member';
  await db.query(
    `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id, user_id) DO NOTHING`,
    [conversationId, targetUserId, role],
  );
}

export async function removeMember(conversationId: string, requesterId: string, targetUserId: string) {
  const conv = await db.query<{ type: ConversationType }>('SELECT type FROM conversations WHERE id = $1', [
    conversationId,
  ]);
  if (!conv.rows[0]) {
    throw new HttpError(404, 'Conversation not found');
  }
  if (conv.rows[0].type === 'direct') {
    throw new HttpError(400, 'Cannot remove members from a direct conversation');
  }

  if (requesterId !== targetUserId) {
    await requireOwnerOrAdmin(conversationId, requesterId);
  }

  await db.query('DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [
    conversationId,
    targetUserId,
  ]);
}

export async function assertMember(conversationId: string, userId: string) {
  const result = await db.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  );
  if (!result.rows[0]) {
    throw new HttpError(403, 'Not a member of this conversation');
  }
}

async function requireOwnerOrAdmin(conversationId: string, userId: string) {
  const result = await db.query<{ role: string }>(
    'SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  );
  const role = result.rows[0]?.role;
  if (role !== 'owner' && role !== 'admin') {
    throw new HttpError(403, 'Requires owner or admin role');
  }
}

export type MuteDuration = 'hour' | 'day' | 'week' | 'forever';

function muteUntilFromDuration(duration: MuteDuration): Date {
  const now = new Date();
  if (duration === 'hour') return new Date(now.getTime() + 60 * 60 * 1000);
  if (duration === 'day') return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (duration === 'week') return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return new Date('9999-12-31T23:59:59Z');
}

export async function muteConversation(conversationId: string, userId: string, duration: MuteDuration) {
  await assertMember(conversationId, userId);
  const mutedUntil = muteUntilFromDuration(duration);
  await db.query(
    'UPDATE conversation_members SET muted_until = $1 WHERE conversation_id = $2 AND user_id = $3',
    [mutedUntil, conversationId, userId],
  );
  return { conversationId, mutedUntil: mutedUntil.toISOString() };
}

export async function unmuteConversation(conversationId: string, userId: string) {
  await assertMember(conversationId, userId);
  await db.query(
    'UPDATE conversation_members SET muted_until = NULL WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  );
  return { conversationId, mutedUntil: null };
}

export async function getMuteStatus(conversationId: string, userId: string) {
  await assertMember(conversationId, userId);
  const result = await db.query<{ muted_until: string | null }>(
    'SELECT muted_until FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  );
  const mutedUntil = result.rows[0]?.muted_until ?? null;
  const isMuted = mutedUntil !== null && new Date(mutedUntil) > new Date();
  return { conversationId, mutedUntil, isMuted };
}
