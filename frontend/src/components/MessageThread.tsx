import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import * as conversationsApi from '../api/conversations';
import * as filesApi from '../api/files';
import * as messagesApi from '../api/messages';
import type {
  Conversation,
  FileMeta,
  Message,
  MessageDeleteResult,
  MessageEditResult,
  MessageType,
  Reaction,
} from '../api/types';
import { ConversationInfoPanel } from './ConversationInfoPanel';
import { Lightbox } from './Lightbox';
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
  onBack?: () => void;
}

function addMessage(messages: Message[], message: Message): Message[] {
  if (messages.some((m) => m.id === message.id)) return messages;
  return [...messages, message];
}

export function MessageThread({ conversationId, presence, onBack }: MessageThreadProps) {
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
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<{ callId: string; type: 'audio' | 'video' } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callId: string; initiatorId: string; type: string } | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😢', '🔥'];
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
        prev.map((m) =>
          m.id === payload.id ? { ...m, ciphertext: payload.ciphertext, editedAt: payload.editedAt } : m,
        ),
      );
    };

    const handleMessageDeleted = (payload: MessageDeleteResult) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.id ? { ...m, ciphertext: '', file: undefined, deletedAt: payload.deletedAt } : m,
        ),
      );
    };

    const handleReactionAdded = (payload: { messageId: string; conversationId: string } & Reaction) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== payload.messageId) return m;
          const reactions = (m.reactions ?? []).filter(
            (r) => !(r.userId === payload.userId && r.emoji === payload.emoji),
          );
          return { ...m, reactions: [...reactions, { emoji: payload.emoji, userId: payload.userId, username: payload.username, displayName: payload.displayName }] };
        }),
      );
    };

    const handleReactionRemoved = (payload: { messageId: string; userId: string; emoji: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id !== payload.messageId
            ? m
            : { ...m, reactions: (m.reactions ?? []).filter((r) => !(r.userId === payload.userId && r.emoji === payload.emoji)) },
        ),
      );
    };

    const handleCallIncoming = (payload: { callId: string; initiatorId: string; type: string; conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
      setIncomingCall({ callId: payload.callId, initiatorId: payload.initiatorId, type: payload.type });
    };

    const handleCallEnded = () => {
      setActiveCall(null);
      setIncomingCall(null);
      if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
      if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('message:read', handleMessageRead);
    socket.on('message:edited', handleMessageEdited);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('reaction:added', handleReactionAdded);
    socket.on('reaction:removed', handleReactionRemoved);
    socket.on('call:incoming', handleCallIncoming);
    socket.on('call:ended', handleCallEnded);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('message:read', handleMessageRead);
      socket.off('message:edited', handleMessageEdited);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('reaction:added', handleReactionAdded);
      socket.off('reaction:removed', handleReactionRemoved);
      socket.off('call:incoming', handleCallIncoming);
      socket.off('call:ended', handleCallEnded);
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
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      socket.emit('typing:stop', { conversationId });
    }, 2000);
  }

  async function dispatchMessage(payload: {
    conversationId: string;
    type?: MessageType;
    ciphertext?: string;
    fileId?: string;
    replyToMessageId?: string;
  }) {
    if (socket) {
      socket.emit('message:send', payload, (res: { ok: boolean; message?: Message; error?: string }) => {
        if (res.ok && res.message) setMessages((prev) => addMessage(prev, res.message!));
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
        prev.map((m) =>
          m.id === messageId ? { ...m, ciphertext: message.ciphertext, editedAt: message.editedAt } : m,
        ),
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
        prev.map((m) =>
          m.id === messageId ? { ...m, ciphertext: '', file: undefined, deletedAt: message.deletedAt } : m,
        ),
      );
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    socket?.emit('typing:stop', { conversationId });
    await dispatchMessage({ conversationId, ciphertext: encodeMessageText(text), replyToMessageId: replyingTo?.id });
    setReplyingTo(null);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { file: fileMeta } = await filesApi.uploadFile(file, file.name);
      await dispatchMessage({ conversationId, type: attachmentTypeForMime(file.type), fileId: fileMeta.id, replyToMessageId: replyingTo?.id });
      setReplyingTo(null);
    } finally {
      setUploading(false);
    }
  }

  async function startRecording() {
    const replyToId = replyingTo?.id;
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
          await dispatchMessage({ conversationId, type: 'audio', fileId: fileMeta.id, replyToMessageId: replyToId });
          setReplyingTo(null);
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

  async function toggleReaction(messageId: string, emoji: string) {
    const msg = messages.find((m) => m.id === messageId);
    const existing = (msg?.reactions ?? []).find((r) => r.userId === user!.id && r.emoji === emoji);
    if (existing) {
      await messagesApi.removeReaction(messageId, emoji);
    } else {
      await messagesApi.addReaction(messageId, emoji);
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const { results } = await messagesApi.searchMessages(searchQuery, conversationId);
    setSearchResults(results.reverse());
  }

  async function startCall(type: 'audio' | 'video') {
    if (!socket) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      localStreamRef.current = stream;
      socket.emit('call:start', { conversationId, type }, (res: { ok: boolean; call?: { id: string }; error?: string }) => {
        if (!res.ok || !res.call) { window.alert(res.error ?? 'Failed to start call'); return; }
        setActiveCall({ callId: res.call.id, type });
      });
    } catch {
      window.alert('Microphone/camera access required for calls.');
    }
  }

  async function answerCall() {
    if (!incomingCall || !socket) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setActiveCall({ callId: incomingCall.callId, type: 'audio' });
      setIncomingCall(null);
    } catch {
      window.alert('Microphone access required.');
    }
  }

  function rejectCall() {
    if (!incomingCall || !socket) return;
    socket.emit('call:reject', { callId: incomingCall.callId, initiatorUserId: incomingCall.initiatorId });
    setIncomingCall(null);
  }

  function endCall() {
    if (!activeCall || !socket) return;
    socket.emit('call:end', { callId: activeCall.callId });
    setActiveCall(null);
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Loading conversation...
      </div>
    );
  }

  const title = getConversationTitle(conversation, user!.id);
  const other = conversation.type === 'direct' ? getOtherMember(conversation, user!.id) : null;
  const isOnline = other ? presence[other.user_id] === 'online' : false;
  const isTyping = typingUsers.size > 0;
  const isGroup = conversation.type !== 'direct';
  const membersById = new Map((conversation.members ?? []).map((m) => [m.user_id, m]));
  const messagesById = new Map(messages.map((m) => [m.id, m]));

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#12161F] border-b border-slate-200 dark:border-[#1E2330] shadow-sm flex-shrink-0">
        {/* Back button — mobile only */}
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden p-2 -ml-1 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors flex-shrink-0"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Clickable avatar + title → opens info panel */}
        <button
          type="button"
          onClick={() => setShowInfoPanel(true)}
          className="flex items-center gap-3 flex-1 min-w-0 rounded-xl hover:bg-slate-50 -mx-2 px-2 py-1 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {title.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-900 dark:text-[#E7ECF3] text-sm leading-tight truncate">{title}</h2>
            <div className="text-xs leading-tight mt-0.5">
              {isTyping ? (
                <span className="text-indigo-500 italic">typing...</span>
              ) : other ? (
                <span className={isOnline ? 'text-emerald-500 font-medium' : 'text-slate-400'}>
                  {isOnline ? '● Online' : '○ Offline'}
                </span>
              ) : isGroup ? (
                <span className="text-slate-400">{conversation.members?.length ?? 0} members</span>
              ) : null}
            </div>
          </div>
        </button>

        {/* Search button */}
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex-shrink-0"
          title="Search messages"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* Audio call */}
        {activeCall ? (
          <button type="button" onClick={endCall}
            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-medium flex items-center gap-1 flex-shrink-0">
            <span className="animate-pulse">●</span> End call
          </button>
        ) : (
          <>
            <button type="button" onClick={() => startCall('audio')}
              className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0" title="Audio call">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
            <button type="button" onClick={() => startCall('video')}
              className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0" title="Video call">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </>
        )}
      </header>

      {/* Search bar */}
      {searchOpen && (
        <form onSubmit={handleSearch} className="flex gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 flex-shrink-0">
          <input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults(null); }}
            placeholder="Search messages in this conversation…"
            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm">Search</button>
          <button type="button" onClick={() => { setSearchOpen(false); setSearchResults(null); setSearchQuery(''); }}
            className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg text-sm">✕</button>
        </form>
      )}

      {/* Incoming call banner */}
      {incomingCall && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border-b border-emerald-200 flex-shrink-0">
          <span className="animate-pulse text-emerald-500">📞</span>
          <span className="text-sm font-medium text-emerald-800 flex-1">Incoming {incomingCall.type} call…</span>
          <button onClick={answerCall} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">Answer</button>
          <button onClick={rejectCall} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm">Decline</button>
        </div>
      )}

      {/* Search results overlay */}
      {searchResults !== null && (
        <div className="absolute inset-0 z-10 bg-white flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <span className="font-semibold text-sm">{searchResults.length} results for "{searchQuery}"</span>
            <button onClick={() => { setSearchResults(null); setSearchOpen(false); setSearchQuery(''); }}
              className="ml-auto text-slate-400 hover:text-slate-600">✕ Close</button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {searchResults.length === 0 ? (
              <p className="px-4 py-8 text-center text-slate-400 text-sm">No messages found</p>
            ) : searchResults.map((m) => {
              const sender = (conversation.members ?? []).find((mb) => mb.user_id === m.senderId);
              return (
                <div key={m.id} className="px-4 py-3 hover:bg-slate-50">
                  <p className="text-xs text-slate-400 mb-1">{sender?.display_name ?? 'Unknown'} · {new Date(m.createdAt).toLocaleString()}</p>
                  <p className="text-sm text-slate-700">{decodeMessageText(m.ciphertext)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Backdrop to close any open message menu */}
      {openMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1.5 bg-slate-50 dark:bg-[#0B0E14]">
        {messages.map((message, index) => {
          const mine = message.senderId === user!.id;
          const read = other ? readReceipts[message.id]?.has(other.user_id) : false;
          const text = decodeMessageText(message.ciphertext);
          const sender = membersById.get(message.senderId);
          const showSender = isGroup && !mine && messages[index - 1]?.senderId !== message.senderId;
          const isEditing = editingMessageId === message.id;
          const isMediaBubble = (message.type === 'image' || message.type === 'video') && !message.deletedAt && !isEditing;

          return (
            <div
              key={message.id}
              className={`flex items-end gap-2 group ${mine ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Group chat sender avatar */}
              {isGroup && !mine && (
                <div
                  className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 self-end mb-0.5"
                  title={sender?.display_name ?? 'Unknown'}
                >
                  {(sender?.display_name ?? '?').slice(0, 1).toUpperCase()}
                </div>
              )}


              {/* Bubble */}
              {isMediaBubble ? (
                /* ── Image / video: no background, timestamp overlaid inside ── */
                <div className={`relative rounded-2xl overflow-hidden max-w-[70%] ${mine ? 'rounded-br-sm' : 'rounded-bl-sm shadow-sm'}`}>
                  {/* Header band: only when there's a reply quote or group sender name */}
                  {(message.replyToMessageId || showSender) && (
                    <div className={`px-3 pt-2.5 pb-2 ${mine ? 'bg-indigo-600' : 'bg-white border-b border-slate-100'}`}>
                      {showSender && (
                        <span className={`block text-xs font-semibold mb-1 ${mine ? 'text-indigo-300' : 'text-indigo-400'}`}>
                          {sender?.display_name ?? 'Unknown'}
                        </span>
                      )}
                      {message.replyToMessageId && (() => {
                        const original = messagesById.get(message.replyToMessageId);
                        const authorName = original
                          ? original.senderId === user!.id ? user!.displayName : membersById.get(original.senderId)?.display_name ?? 'Someone'
                          : null;
                        return (
                          <div className={`px-2.5 py-1.5 rounded-lg border-l-2 ${mine ? 'bg-indigo-500/60 border-indigo-300' : 'bg-slate-100 border-indigo-400'}`}>
                            {original ? (
                              <>
                                <p className={`text-[11px] font-semibold mb-0.5 ${mine ? 'text-indigo-200' : 'text-indigo-500'}`}>{authorName}</p>
                                <p className={`text-xs truncate ${mine ? 'text-indigo-200' : 'text-slate-500'}`}>
                                  {original.deletedAt ? 'This message was deleted' : original.file ? '📎 Attachment' : decodeMessageText(original.ciphertext)}
                                </p>
                              </>
                            ) : (
                              <p className={`text-xs italic ${mine ? 'text-indigo-300' : 'text-slate-400'}`}>Original message</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  <MessageAttachment
                    type={message.type}
                    file={message.file!}
                    isMine={mine}
                    compact
                    onOpen={(file, type) => setLightboxItem({ file, type })}
                  />
                  <span className="absolute bottom-2 right-2 text-[10px] text-white bg-black/40 rounded-full px-1.5 py-0.5 select-none">
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {message.editedAt && ' (edited)'}
                    {mine && read && ' ✓✓'}
                  </span>
                </div>
              ) : (
                /* ── Text / audio / file / deleted: standard colored bubble ── */
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                    mine
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-white dark:bg-[#12161F] border border-slate-200 dark:border-[#1E2330] text-slate-800 dark:text-[#E7ECF3] rounded-bl-sm shadow-sm'
                  }`}
                >
                  {/* Reply quote */}
                  {message.replyToMessageId && (() => {
                    const original = messagesById.get(message.replyToMessageId);
                    const authorName = original
                      ? original.senderId === user!.id
                        ? user!.displayName
                        : membersById.get(original.senderId)?.display_name ?? 'Someone'
                      : null;
                    return (
                      <div
                        className={`mb-2 px-2.5 py-1.5 rounded-lg border-l-2 ${
                          mine
                            ? 'bg-indigo-500/60 border-indigo-300'
                            : 'bg-slate-100 border-indigo-400'
                        }`}
                      >
                        {original ? (
                          <>
                            <p className={`text-[11px] font-semibold mb-0.5 ${mine ? 'text-indigo-200' : 'text-indigo-500'}`}>
                              {authorName}
                            </p>
                            <p className={`text-xs truncate ${mine ? 'text-indigo-200' : 'text-slate-500'}`}>
                              {original.deletedAt
                                ? 'This message was deleted'
                                : original.file
                                  ? '📎 Attachment'
                                  : decodeMessageText(original.ciphertext)}
                            </p>
                          </>
                        ) : (
                          <p className={`text-xs italic ${mine ? 'text-indigo-300' : 'text-slate-400'}`}>
                            Original message
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {showSender && (
                    <span className="block text-xs font-semibold mb-1 text-indigo-300">
                      {sender?.display_name ?? 'Unknown'}
                    </span>
                  )}

                  {message.deletedAt ? (
                    <p className={`text-sm italic ${mine ? 'text-indigo-200' : 'text-slate-400'}`}>
                      This message was deleted
                    </p>
                  ) : (
                    <>
                      {message.file && (
                        <MessageAttachment
                          type={message.type}
                          file={message.file}
                          isMine={mine}
                          onOpen={(file, type) => setLightboxItem({ file, type })}
                        />
                      )}
                      {isEditing ? (
                        <form
                          className="flex flex-col gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitEdit(message.id);
                          }}
                        >
                          <input
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            autoFocus
                            className="w-full bg-indigo-500 text-white placeholder-indigo-300 rounded-lg px-3 py-1.5 text-sm border border-indigo-400 focus:outline-none focus:ring-1 focus:ring-white"
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="flex-1 py-1 bg-white text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-50 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="flex-1 py-1 text-indigo-200 rounded-lg text-xs hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        text && <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
                      )}
                    </>
                  )}

                  {/* Link preview */}
                  {!message.deletedAt && message.linkPreview?.title && (
                    <a href={message.linkPreview.url} target="_blank" rel="noopener noreferrer"
                      className={`block mt-2 rounded-lg overflow-hidden border ${mine ? 'border-indigo-400/40' : 'border-slate-200'} hover:opacity-90 transition-opacity`}>
                      {message.linkPreview.imageUrl && (
                        <img src={message.linkPreview.imageUrl} alt="" className="w-full max-h-32 object-cover" />
                      )}
                      <div className={`px-3 py-2 ${mine ? 'bg-indigo-500/40' : 'bg-slate-50'}`}>
                        {message.linkPreview.siteName && (
                          <p className={`text-[10px] uppercase font-semibold mb-0.5 ${mine ? 'text-indigo-200' : 'text-indigo-400'}`}>{message.linkPreview.siteName}</p>
                        )}
                        <p className={`text-xs font-semibold leading-tight ${mine ? 'text-white' : 'text-slate-800'}`}>{message.linkPreview.title}</p>
                        {message.linkPreview.description && (
                          <p className={`text-[11px] mt-0.5 line-clamp-2 ${mine ? 'text-indigo-200' : 'text-slate-500'}`}>{message.linkPreview.description}</p>
                        )}
                      </div>
                    </a>
                  )}

                  {/* Timestamp + edited + read receipt */}
                  <span
                    className={`block text-right text-[11px] mt-1 select-none ${
                      mine ? 'text-indigo-200' : 'text-slate-400'
                    }`}
                  >
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {message.editedAt && !message.deletedAt && ' (edited)'}
                    {mine && read && ' ✓✓'}
                  </span>
                </div>
              )}

              {/* Reaction bar — below bubble */}
              {!message.deletedAt && (
                <div className={`flex flex-wrap gap-1 mt-0.5 ${mine ? 'justify-end' : 'justify-start'} ${isGroup && !mine ? 'ml-9' : ''}`}>
                  {/* Grouped existing reactions */}
                  {Object.entries(
                    (message.reactions ?? []).reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
                      acc[r.emoji] = { count: (acc[r.emoji]?.count ?? 0) + 1, mine: acc[r.emoji]?.mine || r.userId === user!.id };
                      return acc;
                    }, {}),
                  ).map(([emoji, { count, mine: iMine }]) => (
                    <button key={emoji} onClick={() => toggleReaction(message.id, emoji)}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                        iMine ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}>
                      {emoji} <span>{count}</span>
                    </button>
                  ))}
                  {/* Quick-add emojis — visible on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                    {QUICK_EMOJIS.map((e) => (
                      <button key={e} onClick={() => toggleReaction(message.id, e)}
                        className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-xs flex items-center justify-center transition-colors">
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ⋯ dropdown — left of bubble for mine, right for theirs */}
              {!isEditing && !message.deletedAt && (
                <div
                  className={`relative self-end mb-1 transition-opacity ${
                    openMenuId === message.id
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === message.id ? null : message.id);
                    }}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-sm text-slate-400 hover:text-slate-600 transition-colors"
                    title="Message options"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>

                  {openMenuId === message.id && (
                    <div
                      className={`absolute z-20 bottom-full mb-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden py-1 ${
                        mine ? 'right-0' : 'left-0'
                      }`}
                    >
                      {/* Reply — available on all messages */}
                      <button
                        type="button"
                        onClick={() => { setReplyingTo(message); setOpenMenuId(null); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Reply
                      </button>

                      {/* Edit + Delete — own messages only */}
                      {mine && (
                        <>
                          <div className="h-px bg-slate-100 mx-2" />
                          <button
                            type="button"
                            onClick={() => { startEdit(message); setOpenMenuId(null); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit message
                          </button>
                          <div className="h-px bg-slate-100 mx-2" />
                          <button
                            type="button"
                            onClick={() => { setOpenMenuId(null); handleDelete(message.id); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply preview bar */}
      {replyingTo && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border-t border-indigo-100 flex-shrink-0">
          <div className="w-0.5 h-8 bg-indigo-400 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-600 leading-tight">
              {replyingTo.senderId === user!.id
                ? user!.displayName
                : membersById.get(replyingTo.senderId)?.display_name ?? 'Someone'}
            </p>
            <p className="text-xs text-slate-500 truncate leading-tight mt-0.5">
              {replyingTo.deletedAt
                ? 'This message was deleted'
                : replyingTo.file
                  ? '📎 Attachment'
                  : decodeMessageText(replyingTo.ciphertext)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="p-1.5 rounded-lg hover:bg-indigo-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
            aria-label="Cancel reply"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input bar */}
      <form
        className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-[#12161F] border-t border-slate-200 dark:border-[#1E2330] flex-shrink-0"
        onSubmit={handleSend}
      >
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

        {/* Attach */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || isRecording}
          title="Attach file"
          className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        </button>

        {/* Mic */}
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={uploading}
          title={isRecording ? 'Stop recording' : 'Record voice note'}
          className={`p-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 ${
            isRecording
              ? 'text-red-500 bg-red-50 hover:bg-red-100'
              : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          <svg
            className="w-5 h-5"
            fill={isRecording ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>

        {/* Text input */}
        <input
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setReplyingTo(null); }}
          placeholder={isRecording ? 'Recording...' : uploading ? 'Uploading...' : replyingTo ? 'Reply...' : 'Message...'}
          autoComplete="off"
          disabled={isRecording || uploading}
          className="flex-1 bg-slate-100 dark:bg-[#1E2330] rounded-full px-4 py-2.5 text-sm text-slate-900 dark:text-[#E7ECF3] placeholder-slate-400 dark:placeholder-[#5C6779] focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-[#5EE6A8] focus:bg-white dark:focus:bg-[#161B26] disabled:opacity-60 transition-all"
        />

        {/* Send */}
        <button
          type="submit"
          disabled={!input.trim() || uploading || isRecording}
          title="Send"
          className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </form>

      {/* Info panel slide-in */}
      {showInfoPanel && (
        <>
          <div
            className="absolute inset-0 z-20 bg-black/20"
            onClick={() => setShowInfoPanel(false)}
          />
          <div className="absolute inset-y-0 right-0 w-80 z-30 shadow-2xl">
            <ConversationInfoPanel
              conversation={conversation}
              currentUserId={user!.id}
              presence={presence}
              onClose={() => setShowInfoPanel(false)}
              onOpenLightbox={(file, type) => setLightboxItem({ file, type })}
              initialTab="media"
            />
          </div>
        </>
      )}

      {lightboxItem && (
        <Lightbox file={lightboxItem.file} type={lightboxItem.type} onClose={() => setLightboxItem(null)} />
      )}
    </div>
  );
}
