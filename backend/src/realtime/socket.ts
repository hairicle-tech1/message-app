import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server, type Socket } from 'socket.io';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import type { AuthUser } from '../middleware/auth.middleware.js';
import { assertMember } from '../modules/conversations/conversations.service.js';
import * as messagesService from '../modules/messages/messages.service.js';

interface AuthedSocket extends Socket {
  data: {
    user: AuthUser;
  };
}

const PRESENCE_KEY_PREFIX = 'presence:user:';

export function setupRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Missing auth token'));
      return;
    }

    try {
      const payload = jwt.verify(token, env.jwtSecret) as AuthUser;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    void handleConnection(io, socket as AuthedSocket);
  });

  return io;
}

async function handleConnection(io: Server, socket: AuthedSocket) {
  const { user } = socket.data;

  await joinConversationRooms(socket);
  await markUserOnline(io, user.id);

  socket.on('typing:start', async (payload: { conversationId: string }) => {
    if (!(await isMember(socket, payload.conversationId))) return;
    socket.to(`conversation:${payload.conversationId}`).emit('typing:start', {
      conversationId: payload.conversationId,
      userId: user.id,
    });
  });

  socket.on('typing:stop', async (payload: { conversationId: string }) => {
    if (!(await isMember(socket, payload.conversationId))) return;
    socket.to(`conversation:${payload.conversationId}`).emit('typing:stop', {
      conversationId: payload.conversationId,
      userId: user.id,
    });
  });

  socket.on(
    'message:send',
    async (
      payload: {
        conversationId: string;
        type?: string;
        ciphertext?: string;
        replyToMessageId?: string;
        fileId?: string;
      },
      callback?: (response: { ok: boolean; message?: unknown; error?: string }) => void,
    ) => {
      try {
        const message = await messagesService.sendMessage(user.id, payload as never);
        io.to(`conversation:${message.conversationId}`).emit('message:new', message);
        callback?.({ ok: true, message });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'message:read',
    async (payload: { messageId: string }, callback?: (response: { ok: boolean; error?: string }) => void) => {
      try {
        await messagesService.markMessageRead(payload.messageId, user.id, user.deviceId);

        const result = await db.query<{ conversation_id: string }>(
          'SELECT conversation_id FROM messages WHERE id = $1',
          [payload.messageId],
        );
        const conversationId = result.rows[0]?.conversation_id;
        if (conversationId) {
          io.to(`conversation:${conversationId}`).emit('message:read', {
            messageId: payload.messageId,
            userId: user.id,
            deviceId: user.deviceId,
          });
        }

        callback?.({ ok: true });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'message:edit',
    async (
      payload: { messageId: string; ciphertext: string },
      callback?: (response: { ok: boolean; message?: unknown; error?: string }) => void,
    ) => {
      try {
        const message = await messagesService.editMessage(payload.messageId, user.id, payload.ciphertext);
        io.to(`conversation:${message.conversationId}`).emit('message:edited', message);
        callback?.({ ok: true, message });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'message:delete',
    async (payload: { messageId: string }, callback?: (response: { ok: boolean; error?: string }) => void) => {
      try {
        const result = await messagesService.deleteMessage(payload.messageId, user.id);
        io.to(`conversation:${result.conversationId}`).emit('message:deleted', result);
        callback?.({ ok: true });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on('disconnect', () => {
    void markUserOffline(io, user.id);
  });
}

async function joinConversationRooms(socket: AuthedSocket) {
  const result = await db.query<{ conversation_id: string }>(
    'SELECT conversation_id FROM conversation_members WHERE user_id = $1',
    [socket.data.user.id],
  );
  for (const row of result.rows) {
    socket.join(`conversation:${row.conversation_id}`);
  }
}

async function isMember(socket: AuthedSocket, conversationId: string) {
  try {
    await assertMember(conversationId, socket.data.user.id);
    return true;
  } catch {
    return false;
  }
}

async function markUserOnline(io: Server, userId: string) {
  const key = `${PRESENCE_KEY_PREFIX}${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    io.emit('presence:update', { userId, status: 'online' });
  }
}

async function markUserOffline(io: Server, userId: string) {
  const key = `${PRESENCE_KEY_PREFIX}${userId}`;
  const count = await redis.decr(key);
  if (count <= 0) {
    await redis.del(key);
    await db.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]);
    io.emit('presence:update', { userId, status: 'offline' });
  }
}
