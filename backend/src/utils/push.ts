import { getMessaging } from 'firebase-admin/messaging';
import { db } from '../config/db.js';
import { firebaseApp, fcmEnabled } from '../config/firebase.js';
import { redis } from '../config/redis.js';

const PRESENCE_KEY_PREFIX = 'presence:user:';

interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

async function getOfflineTokens(userIds: string[]): Promise<string[]> {
  const tokens: string[] = [];
  for (const userId of userIds) {
    const count = await redis.get(`${PRESENCE_KEY_PREFIX}${userId}`);
    if (count && Number(count) > 0) continue; // online — skip push

    const rows = await db.query<{ push_token: string }>(
      'SELECT push_token FROM user_devices WHERE user_id = $1 AND push_token IS NOT NULL',
      [userId],
    );
    tokens.push(...rows.rows.map((r) => r.push_token));
  }
  return tokens;
}

async function removeInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.query('UPDATE user_devices SET push_token = NULL WHERE push_token = ANY($1)', [tokens]);
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!fcmEnabled || !firebaseApp || userIds.length === 0) return;

  const tokens = await getOfflineTokens(userIds);
  if (tokens.length === 0) return;

  try {
    const response = await getMessaging(firebaseApp).sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });

    const invalidTokens = response.responses
      .map((resp, i) => ({ resp, token: tokens[i] }))
      .filter(({ resp }) =>
        !resp.success &&
        (resp.error?.code === 'messaging/registration-token-not-registered' ||
          resp.error?.code === 'messaging/invalid-registration-token'),
      )
      .map(({ token }) => token);

    void removeInvalidTokens(invalidTokens);
  } catch (err) {
    console.error('[push] FCM send error:', err);
  }
}

export async function sendNewMessagePush(
  messageId: string,
  conversationId: string,
  senderId: string,
  type: string,
  ciphertext: string,
): Promise<void> {
  if (!fcmEnabled) return;

  const metaResult = await db.query<{
    sender_display_name: string;
    conv_type: string;
    conv_name: string | null;
    recipient_ids: string[];
  }>(
    `SELECT u.display_name AS sender_display_name,
            c.type AS conv_type,
            c.name AS conv_name,
            ARRAY_AGG(cm.user_id) AS recipient_ids
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id
     JOIN users u ON u.id = $2
     WHERE c.id = $1
     GROUP BY u.display_name, c.type, c.name`,
    [conversationId, senderId],
  );
  const meta = metaResult.rows[0];
  if (!meta) return;

  const recipientIds = meta.recipient_ids.filter((id) => id !== senderId);
  if (recipientIds.length === 0) return;

  const senderName = meta.sender_display_name;
  const title =
    meta.conv_type === 'direct'
      ? senderName
      : `${senderName} in ${meta.conv_name ?? 'a group'}`;

  let body: string;
  if (type === 'text') {
    const plaintext = Buffer.from(ciphertext, 'base64').toString('utf8');
    body = plaintext.length > 100 ? `${plaintext.slice(0, 100)}…` : plaintext;
  } else if (type === 'image') body = '📷 Image';
  else if (type === 'video') body = '🎥 Video';
  else if (type === 'audio') body = '🎤 Voice note';
  else if (type === 'file') body = '📎 File';
  else body = 'New message';

  void sendPushToUsers(recipientIds, {
    title,
    body,
    data: { conversationId, messageId, type },
  });
}
