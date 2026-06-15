export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
}

export interface DirectoryUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  department: string | null;
}

export type ConversationType = 'direct' | 'group' | 'channel';

export interface ConversationMember {
  user_id: string;
  role: string;
  joined_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  members?: ConversationMember[];
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'system';

export interface FileMeta {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hasThumbnail: boolean;
  createdAt: string;
}

export interface ConversationMediaItem {
  messageId: string;
  type: MessageType;
  createdAt: string;
  file: FileMeta;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  ciphertext: string;
  replyToMessageId: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  file?: FileMeta;
}

export interface MessageEditResult {
  id: string;
  conversationId: string;
  ciphertext: string;
  editedAt: string;
}

export interface MessageDeleteResult {
  id: string;
  conversationId: string;
  deletedAt: string;
}

export interface LoginResponse {
  token: string;
  deviceId: string;
  user: User;
}
