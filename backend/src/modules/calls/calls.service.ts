import { db } from '../../config/db.js';
import { HttpError } from '../../middleware/error.middleware.js';
import { assertMember } from '../conversations/conversations.service.js';

export type CallType = 'audio' | 'video';

export interface CallRecord {
  id: string;
  conversationId: string;
  initiatorId: string;
  type: CallType;
  startedAt: string;
  endedAt: string | null;
  durationSecs: number | null;
  participants: CallParticipant[];
}

export interface CallParticipant {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
  leftAt: string | null;
}

export async function initiateCall(
  conversationId: string,
  initiatorId: string,
  type: CallType,
): Promise<CallRecord> {
  await assertMember(conversationId, initiatorId);

  // End any existing active call in this conversation
  await db.query(
    `UPDATE calls SET ended_at = now()
     WHERE conversation_id = $1 AND ended_at IS NULL`,
    [conversationId],
  );

  const result = await db.query<{ id: string; started_at: string }>(
    `INSERT INTO calls (conversation_id, initiator_id, type)
     VALUES ($1, $2, $3) RETURNING id, started_at`,
    [conversationId, initiatorId, type],
  );
  const call = result.rows[0];

  // Add initiator as first participant
  await db.query(
    'INSERT INTO call_participants (call_id, user_id) VALUES ($1, $2)',
    [call.id, initiatorId],
  );

  return getCallById(call.id, initiatorId);
}

export async function joinCall(callId: string, userId: string): Promise<CallRecord> {
  const callResult = await db.query<{ conversation_id: string; ended_at: string | null }>(
    'SELECT conversation_id, ended_at FROM calls WHERE id = $1',
    [callId],
  );
  const call = callResult.rows[0];
  if (!call) throw new HttpError(404, 'Call not found');
  if (call.ended_at) throw new HttpError(400, 'Call has already ended');

  await assertMember(call.conversation_id, userId);

  // Upsert participant — re-joining sets left_at back to null
  await db.query(
    `INSERT INTO call_participants (call_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (call_id, user_id) DO UPDATE SET joined_at = now(), left_at = NULL`,
    [callId, userId],
  );

  return getCallById(callId, userId);
}

export async function leaveCall(callId: string, userId: string): Promise<{ callEnded: boolean }> {
  const callResult = await db.query<{ initiator_id: string; ended_at: string | null }>(
    'SELECT initiator_id, ended_at FROM calls WHERE id = $1',
    [callId],
  );
  const call = callResult.rows[0];
  if (!call || call.ended_at) return { callEnded: true };

  await db.query(
    `UPDATE call_participants SET left_at = now()
     WHERE call_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [callId, userId],
  );

  // Check if anyone is still in the call
  const remaining = await db.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM call_participants WHERE call_id = $1 AND left_at IS NULL',
    [callId],
  );
  const active = Number(remaining.rows[0]?.count ?? 0);

  if (active === 0) {
    await db.query('UPDATE calls SET ended_at = now() WHERE id = $1', [callId]);
    return { callEnded: true };
  }

  return { callEnded: false };
}

export async function endCall(callId: string, userId: string): Promise<void> {
  const callResult = await db.query<{ initiator_id: string; conversation_id: string }>(
    'SELECT initiator_id, conversation_id FROM calls WHERE id = $1',
    [callId],
  );
  const call = callResult.rows[0];
  if (!call) throw new HttpError(404, 'Call not found');
  await assertMember(call.conversation_id, userId);

  await db.query(
    `UPDATE call_participants SET left_at = now() WHERE call_id = $1 AND left_at IS NULL`,
    [callId],
  );
  await db.query('UPDATE calls SET ended_at = now() WHERE id = $1 AND ended_at IS NULL', [callId]);
}

export async function getCallById(callId: string, userId: string): Promise<CallRecord> {
  const callResult = await db.query<{
    id: string;
    conversation_id: string;
    initiator_id: string;
    type: CallType;
    started_at: string;
    ended_at: string | null;
  }>('SELECT id, conversation_id, initiator_id, type, started_at, ended_at FROM calls WHERE id = $1', [callId]);

  const call = callResult.rows[0];
  if (!call) throw new HttpError(404, 'Call not found');
  await assertMember(call.conversation_id, userId);

  const participants = await getParticipants(callId);

  const durationSecs =
    call.ended_at
      ? Math.round((new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) / 1000)
      : null;

  return {
    id: call.id,
    conversationId: call.conversation_id,
    initiatorId: call.initiator_id,
    type: call.type,
    startedAt: call.started_at,
    endedAt: call.ended_at,
    durationSecs,
    participants,
  };
}

export async function getCallHistory(conversationId: string, userId: string): Promise<CallRecord[]> {
  await assertMember(conversationId, userId);

  const result = await db.query<{
    id: string;
    conversation_id: string;
    initiator_id: string;
    type: CallType;
    started_at: string;
    ended_at: string | null;
  }>(
    `SELECT id, conversation_id, initiator_id, type, started_at, ended_at
     FROM calls WHERE conversation_id = $1
     ORDER BY started_at DESC LIMIT 50`,
    [conversationId],
  );

  return Promise.all(
    result.rows.map(async (call) => {
      const participants = await getParticipants(call.id);
      const durationSecs =
        call.ended_at
          ? Math.round((new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) / 1000)
          : null;
      return {
        id: call.id,
        conversationId: call.conversation_id,
        initiatorId: call.initiator_id,
        type: call.type,
        startedAt: call.started_at,
        endedAt: call.ended_at,
        durationSecs,
        participants,
      };
    }),
  );
}

async function getParticipants(callId: string): Promise<CallParticipant[]> {
  const result = await db.query<{
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    joined_at: string;
    left_at: string | null;
  }>(
    `SELECT cp.user_id, u.username, u.display_name, u.avatar_url, cp.joined_at, cp.left_at
     FROM call_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.call_id = $1
     ORDER BY cp.joined_at`,
    [callId],
  );

  return result.rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    joinedAt: r.joined_at,
    leftAt: r.left_at,
  }));
}
