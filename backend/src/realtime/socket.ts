import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server, type Socket } from 'socket.io';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import type { AuthUser } from '../middleware/auth.middleware.js';
import { assertMember, pinMessage, unpinMessage } from '../modules/conversations/conversations.service.js';
import * as messagesService from '../modules/messages/messages.service.js';
import * as callsService from '../modules/calls/calls.service.js';
import { sendPushToUsers } from '../utils/push.js';

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
  socket.join(`user:${user.id}`); // personal room for direct signalling
  await markUserOnline(io, user.id);

  socket.on('presence:get', () => {
    void sendPresenceSnapshot(socket);
  });

  let offlineHandled = false;

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
        const { conversationId, readAt } = await messagesService.markMessageRead(
          payload.messageId,
          user.id,
          user.deviceId,
        );
        io.to(`conversation:${conversationId}`).emit('message:read', {
          messageId: payload.messageId,
          userId: user.id,
          deviceId: user.deviceId,
          readAt,
        });

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

  socket.on(
    'reaction:add',
    async (
      payload: { messageId: string; emoji: string },
      callback?: (response: { ok: boolean; reaction?: unknown; error?: string }) => void,
    ) => {
      try {
        const reaction = await messagesService.addReaction(payload.messageId, user.id, payload.emoji);
        io.to(`conversation:${reaction.conversationId}`).emit('reaction:added', {
          messageId: payload.messageId,
          ...reaction,
        });
        callback?.({ ok: true, reaction });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'reaction:remove',
    async (
      payload: { messageId: string; emoji: string },
      callback?: (response: { ok: boolean; error?: string }) => void,
    ) => {
      try {
        const { conversationId } = await messagesService.removeReaction(payload.messageId, user.id, payload.emoji);
        io.to(`conversation:${conversationId}`).emit('reaction:removed', {
          messageId: payload.messageId,
          userId: user.id,
          emoji: payload.emoji,
        });
        callback?.({ ok: true });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'message:pin',
    async (
      payload: { conversationId: string; messageId: string },
      callback?: (response: { ok: boolean; pin?: unknown; error?: string }) => void,
    ) => {
      try {
        const pin = await pinMessage(payload.conversationId, payload.messageId, user.id);
        io.to(`conversation:${payload.conversationId}`).emit('message:pinned', pin);
        callback?.({ ok: true, pin });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'message:unpin',
    async (
      payload: { conversationId: string; messageId: string },
      callback?: (response: { ok: boolean; error?: string }) => void,
    ) => {
      try {
        await unpinMessage(payload.conversationId, payload.messageId, user.id);
        io.to(`conversation:${payload.conversationId}`).emit('message:unpinned', {
          conversationId: payload.conversationId,
          messageId: payload.messageId,
          unpinnedBy: user.id,
        });
        callback?.({ ok: true });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  // ── WebRTC Call Signalling ─────────────────────────────────────────────────

  socket.on(
    'call:start',
    async (
      payload: { conversationId: string; type: 'audio' | 'video' },
      callback?: (r: { ok: boolean; call?: unknown; error?: string }) => void,
    ) => {
      try {
        const call = await callsService.initiateCall(payload.conversationId, user.id, payload.type);

        // Notify all other conversation members of incoming call
        socket.to(`conversation:${payload.conversationId}`).emit('call:incoming', {
          callId: call.id,
          conversationId: payload.conversationId,
          initiatorId: user.id,
          type: payload.type,
        });

        // Push notification to offline members
        const otherMemberIds = call.participants
          .map((p) => p.userId)
          .filter((id) => id !== user.id);
        void sendPushToUsers(otherMemberIds, {
          title: 'Incoming call',
          body: `${user.email} is calling`,
          data: { callId: call.id, conversationId: payload.conversationId, type: payload.type },
        });

        callback?.({ ok: true, call });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'call:offer',
    async (
      payload: { callId: string; targetUserId: string; sdp: unknown },
      callback?: (r: { ok: boolean; error?: string }) => void,
    ) => {
      try {
        // Relay SDP offer directly to the target user's personal room
        io.to(`user:${payload.targetUserId}`).emit('call:offer', {
          callId: payload.callId,
          fromUserId: user.id,
          sdp: payload.sdp,
        });
        callback?.({ ok: true });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'call:answer',
    async (
      payload: { callId: string; targetUserId: string; sdp: unknown },
      callback?: (r: { ok: boolean; error?: string }) => void,
    ) => {
      try {
        await callsService.joinCall(payload.callId, user.id);
        io.to(`user:${payload.targetUserId}`).emit('call:answer', {
          callId: payload.callId,
          fromUserId: user.id,
          sdp: payload.sdp,
        });
        // Notify conversation the call was answered
        const call = await callsService.getCallById(payload.callId, user.id);
        io.to(`conversation:${call.conversationId}`).emit('call:joined', {
          callId: payload.callId,
          userId: user.id,
        });
        callback?.({ ok: true });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'call:ice-candidate',
    (
      payload: { callId: string; targetUserId: string; candidate: unknown },
      callback?: (r: { ok: boolean; error?: string }) => void,
    ) => {
      try {
        io.to(`user:${payload.targetUserId}`).emit('call:ice-candidate', {
          callId: payload.callId,
          fromUserId: user.id,
          candidate: payload.candidate,
        });
        callback?.({ ok: true });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'call:reject',
    async (
      payload: { callId: string; initiatorUserId: string },
      callback?: (r: { ok: boolean; error?: string }) => void,
    ) => {
      try {
        io.to(`user:${payload.initiatorUserId}`).emit('call:rejected', {
          callId: payload.callId,
          byUserId: user.id,
        });
        callback?.({ ok: true });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'call:leave',
    async (
      payload: { callId: string },
      callback?: (r: { ok: boolean; callEnded?: boolean; error?: string }) => void,
    ) => {
      try {
        const { callEnded } = await callsService.leaveCall(payload.callId, user.id);
        const call = await callsService.getCallById(payload.callId, user.id);

        io.to(`conversation:${call.conversationId}`).emit('call:participant-left', {
          callId: payload.callId,
          userId: user.id,
          callEnded,
        });

        if (callEnded) {
          io.to(`conversation:${call.conversationId}`).emit('call:ended', {
            callId: payload.callId,
            durationSecs: call.durationSecs,
          });
        }

        callback?.({ ok: true, callEnded });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on(
    'call:end',
    async (
      payload: { callId: string },
      callback?: (r: { ok: boolean; error?: string }) => void,
    ) => {
      try {
        const call = await callsService.getCallById(payload.callId, user.id);
        await callsService.endCall(payload.callId, user.id);
        const ended = await callsService.getCallById(payload.callId, user.id);

        io.to(`conversation:${call.conversationId}`).emit('call:ended', {
          callId: payload.callId,
          endedBy: user.id,
          durationSecs: ended.durationSecs,
        });

        callback?.({ ok: true });
      } catch (err) {
        callback?.({ ok: false, error: (err as Error).message });
      }
    },
  );

  socket.on('user:offline', () => {
    if (!offlineHandled) {
      offlineHandled = true;
      void markUserOffline(io, user.id);
    }
  });

  socket.on('disconnect', () => {
    if (!offlineHandled) {
      offlineHandled = true;
      void markUserOffline(io, user.id);
    }
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

async function sendPresenceSnapshot(socket: AuthedSocket) {
  const keys = await redis.keys(`${PRESENCE_KEY_PREFIX}*`);
  const onlineUserIds = keys.map((key) => key.replace(PRESENCE_KEY_PREFIX, ''));
  socket.emit('presence:init', { onlineUserIds });
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
  if (count === 0) {
    await redis.del(key);
    await db.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]);
    io.emit('presence:update', { userId, status: 'offline' });
  } else if (count < 0) {
    await redis.del(key);
  }
}
