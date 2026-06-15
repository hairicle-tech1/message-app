import { apiFetch } from './client';
import type { Message, MessageDeleteResult, MessageEditResult, MessageType } from './types';

export function listMessages(conversationId: string, before?: string) {
  const params = new URLSearchParams({ conversationId });
  if (before) {
    params.set('before', before);
  }
  return apiFetch<{ messages: Message[] }>(`/api/messages?${params.toString()}`);
}

export function sendMessage(input: {
  conversationId: string;
  type?: MessageType;
  ciphertext?: string;
  replyToMessageId?: string;
  fileId?: string;
}) {
  return apiFetch<{ message: Message }>('/api/messages', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function markMessageRead(messageId: string) {
  return apiFetch<void>(`/api/messages/${messageId}/read`, { method: 'POST' });
}

export function editMessage(messageId: string, ciphertext: string) {
  return apiFetch<{ message: MessageEditResult }>(`/api/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ ciphertext }),
  });
}

export function deleteMessage(messageId: string) {
  return apiFetch<{ message: MessageDeleteResult }>(`/api/messages/${messageId}`, {
    method: 'DELETE',
  });
}
