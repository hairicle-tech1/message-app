import { apiFetch } from './client';
import type { Message, MessageType } from './types';

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
