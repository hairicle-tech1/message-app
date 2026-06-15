import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import * as conversationsApi from '../api/conversations';
import * as filesApi from '../api/files';
import * as messagesApi from '../api/messages';
import type { Conversation, FileMeta, Message, MessageDeleteResult, MessageEditResult, MessageType } from '../api/types';
import { Lightbox } from './Lightbox';
import { MediaGallery } from './MediaGallery';
import { MessageAttachment } from './MessageAttachment';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getConversationTitle, getOtherMember } from '../utils/conversation';
import { decodeMessageText, encodeMessageText } from '../utils/text';

function attachmentTypeForMime(mimeType: string): MessageType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

interface MessageThreadProps {
  conversationId: string;
  presence: Record<string, 'online' | 'offline'>;
}

function addMessage(messages: Message[], message: Message): Message[] {
  if (messages.some((m) => m.id === message.id)) {
    return messages;
  }
  return [...messages, message];
}

export function MessageThread({ conversationId, presence }: MessageThreadProps) {
  const { user } = useAuth();
  const socket = useSocket();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [readReceipts, setReadReceipts] = useState<Record<string, Set<string>>>({});
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<{ file: FileMeta; type: MessageType } | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const markedReadRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let cancelled = false;
    markedReadRef.current = new Set();
    setMessages([]);
    setConversation(null);
    setReadReceipts({});
    setTypingUsers(new Set());

    conversationsApi.getConversation(conversationId).then(({ conversation }) => {
      if (!cancelled) setConversation(conversation);
    });

    messagesApi.listMessages(conversationId).then(({ messages }) => {
      if (!cancelled) setMessages([...messages].reverse());
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!socket || !user) return;

    const handleNewMessage = (message: Message) => {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => addMessage(prev, message));
    };

    const handleTypingStart = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId !== conversationId || payload.userId === user.id) return;
      setTypingUsers((prev) => new Set(prev).add(payload.userId));
    };

    const handleTypingStop = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId !== conversationId) return;
      setTypingUsers((prev) => {
        const next = new Set(prev);
        next.delete(payload.userId);
        return next;
      });
    };

    const handleMessageRead = (payload: { messageId: string; userId: string }) => {
      setReadReceipts((prev) => {
        const set = new Set(prev[payload.messageId] ?? []);
        set.add(payload.userId);
        return { ...prev, [payload.messageId]: set };
      });
    };

    const handleMessageEdited = (payload: MessageEditResult) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.id ? { ...m, ciphertext: payload.ciphertext, editedAt: payload.editedAt } : m)),
      );
    };

    const handleMessageDeleted = (payload: MessageDeleteResult) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.id ? { ...m, ciphertext: '', file: undefined, deletedAt: payload.deletedAt } : m)),
      );
    };

    socket.on('message:new', handleNewMessage);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('message:read', handleMessageRead);
    socket.on('message:edited', handleMessageEdited);
    socket.on('message:deleted', handleMessageDeleted);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('message:read', handleMessageRead);
      socket.off('message:edited', handleMessageEdited);
      socket.off('message:deleted', handleMessageDeleted);
    };
  }, [socket, conversationId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!socket || !user) return;
    for (const message of messages) {
      if (message.senderId !== user.id && !markedReadRef.current.has(message.id)) {
        markedReadRef.current.add(message.id);
        socket.emit('message:read', { messageId: message.id });
      }
    }
  }, [socket, user, messages]);

  function handleInputChange(value: string) {
    setInput(value);
    if (!socket) return;

    socket.emit('typing:start', { conversationId });

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      socket.emit('typing:stop', { conversationId });
    }, 2000);
  }

  async function dispatchMessage(payload: {
    conversationId: string;
    type?: MessageType;
    ciphertext?: string;
    fileId?: string;
  }) {
    if (socket) {
      socket.emit('message:send', payload, (res: { ok: boolean; message?: Message; error?: string }) => {
        if (res.ok && res.message) {
          setMessages((prev) => addMessage(prev, res.message!));
        }
      });
    } else {
      const { message } = await messagesApi.sendMessage(payload);
      setMessages((prev) => addMessage(prev, message));
    }
  }

  function startEdit(message: Message) {
    setEditingMessageId(message.id);
    setEditingText(decodeMessageText(message.ciphertext));
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditingText('');
  }

  async function submitEdit(messageId: string) {
    const ciphertext = encodeMessageText(editingText.trim());
    cancelEdit();

    if (socket) {
      socket.emit('message:edit', { messageId, ciphertext }, (res: { ok: boolean; error?: string }) => {
        if (!res.ok) window.alert(res.error ?? 'Failed to edit message');
      });
    } else {
      const { message } = await messagesApi.editMessage(messageId, ciphertext);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, ciphertext: message.ciphertext, editedAt: message.editedAt } : m)),
      );
    }
  }

  async function handleDelete(messageId: string) {
    if (!window.confirm('Delete this message?')) return;

    if (socket) {
      socket.emit('message:delete', { messageId }, (res: { ok: boolean; error?: string }) => {
        if (!res.ok) window.alert(res.error ?? 'Failed to delete message');
      });
    } else {
      const { message } = await messagesApi.deleteMessage(messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, ciphertext: '', file: undefined, deletedAt: message.deletedAt } : m)),
      );
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    setInput('');
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    socket?.emit('typing:stop', { conversationId });

    await dispatchMessage({ conversationId, ciphertext: encodeMessageText(text) });
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const { file: fileMeta } = await filesApi.uploadFile(file, file.name);
      await dispatchMessage({ conversationId, type: attachmentTypeForMime(file.type), fileId: fileMeta.id });
    } finally {
      setUploading(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });

        setUploading(true);
        try {
          const { file: fileMeta } = await filesApi.uploadFile(blob, 'voice-note.webm');
          await dispatchMessage({ conversationId, type: 'audio', fileId: fileMeta.id });
        } finally {
          setUploading(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      window.alert('Microphone access is required to record a voice note.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }

  if (!conversation) {
    return <div className="message-thread loading">Loading conversation...</div>;
  }

  const title = getConversationTitle(conversation, user!.id);
  const other = conversation.type === 'direct' ? getOtherMember(conversation, user!.id) : null;
  const isOnline = other ? presence[other.user_id] === 'online' : false;
  const isTyping = typingUsers.size > 0;
  const isGroup = conversation.type !== 'direct';
  const membersById = new Map((conversation.members ?? []).map((m) => [m.user_id, m]));

  return (
    <div className="message-thread">
      <header className="thread-header">
        <div>
          <h2>{title}</h2>
          {other && <span className={`presence-label ${isOnline ? 'online' : 'offline'}`}>{isOnline ? 'Online' : 'Offline'}</span>}
          {isGroup && <span className="presence-label">{conversation.members?.length ?? 0} members</span>}
        </div>
        <div className="thread-header-actions">
          {isTyping && <span className="typing-indicator">typing...</span>}
          <button type="button" className="link-button" onClick={() => setShowGallery(true)}>
            Media
          </button>
        </div>
      </header>

      <div className="message-list">
        {messages.map((message, index) => {
          const mine = message.senderId === user!.id;
          const read = other ? readReceipts[message.id]?.has(other.user_id) : false;

          const text = decodeMessageText(message.ciphertext);
          const sender = membersById.get(message.senderId);
          const showSender = isGroup && !mine && messages[index - 1]?.senderId !== message.senderId;

          const isEditing = editingMessageId === message.id;

          return (
            <div key={message.id} className={`message-row ${mine ? 'mine' : 'theirs'}`}>
              {isGroup && !mine && (
                <span className="message-avatar" title={sender?.display_name ?? 'Unknown'}>
                  {(sender?.display_name ?? '?').slice(0, 1).toUpperCase()}
                </span>
              )}
              {mine && !isEditing && !message.deletedAt && (
                <div className="message-actions">
                  <button type="button" className="message-action-button" title="Edit" onClick={() => startEdit(message)}>
                    ✏️
                  </button>
                  <button type="button" className="message-action-button" title="Delete" onClick={() => handleDelete(message.id)}>
                    🗑️
                  </button>
                </div>
              )}
              <div className={`message-bubble ${mine ? 'mine' : 'theirs'}`}>
                {showSender && <span className="message-sender">{sender?.display_name ?? 'Unknown'}</span>}
                {message.deletedAt ? (
                  <p className="message-deleted">This message was deleted</p>
                ) : (
                  <>
                    {message.file && (
                      <MessageAttachment
                        type={message.type}
                        file={message.file}
                        onOpen={(file, type) => setLightboxItem({ file, type })}
                      />
                    )}
                    {isEditing ? (
                      <form
                        className="message-edit-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitEdit(message.id);
                        }}
                      >
                        <input
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          autoFocus
                        />
                        <div className="message-edit-actions">
                          <button type="submit">Save</button>
                          <button type="button" onClick={cancelEdit}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      text && <p>{text}</p>
                    )}
                  </>
                )}
                <span className="message-meta">
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {message.editedAt && !message.deletedAt && ' (edited)'}
                  {mine && read && ' ✓✓'}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="message-input" onSubmit={handleSend}>
        <input ref={fileInputRef} type="file" className="file-input-hidden" onChange={handleFileChange} />
        <button
          type="button"
          className="icon-button"
          title="Attach file"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || isRecording}
        >
          📎
        </button>
        <button
          type="button"
          className={`icon-button ${isRecording ? 'recording' : ''}`}
          title={isRecording ? 'Stop recording' : 'Record voice note'}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={uploading}
        >
          🎤
        </button>
        <input
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={isRecording ? 'Recording voice note...' : uploading ? 'Uploading...' : 'Type a message'}
          autoComplete="off"
          disabled={isRecording || uploading}
        />
        <button type="submit" disabled={!input.trim() || uploading || isRecording}>
          Send
        </button>
      </form>

      {showGallery && (
        <MediaGallery
          conversationId={conversationId}
          onClose={() => setShowGallery(false)}
          onOpen={(file, type) => setLightboxItem({ file, type })}
        />
      )}

      {lightboxItem && (
        <Lightbox file={lightboxItem.file} type={lightboxItem.type} onClose={() => setLightboxItem(null)} />
      )}
    </div>
  );
}
