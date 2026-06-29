import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/client';
import * as messagesApi from '../api/messages';
import type { Conversation, Message } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { decodeMessageText, encodeMessageText } from '../utils/text';

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconSearch(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>; }
function IconSend(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>; }
function IconMegaphone(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>; }
function IconLock(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>; }
function IconUsers(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><circle cx="9" cy="7" r="3.2"/><path d="M2.5 19c0-3.3 3-5.5 6.5-5.5S15.5 15.7 15.5 19"/><circle cx="17" cy="8.5" r="2.5"/><path d="M16 13.2c2.6.4 4.5 2.2 4.5 5"/></svg>; }
function IconGlobe(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3c-2.8 3-4.5 5.7-4.5 9s1.7 6 4.5 9M12 3c2.8 3 4.5 5.7 4.5 9s-1.7 6-4.5 9"/></svg>; }
function IconBuilding(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/></svg>; }

interface ChannelGroup {
  label: string;
  icon: React.ReactNode;
  channels: Conversation[];
}

interface ChannelMember {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
}

export function AnnounceWorkspace() {
  const { user } = useAuth();
  const socket = useSocket();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load channels (type=channel only) and teams
  useEffect(() => {
    apiFetch<{ conversations: Conversation[] }>('/api/conversations')
      .then(({ conversations }) => {
        setConversations(conversations.filter((c) => c.type === 'channel'));
      }).catch(() => {});
    apiFetch<{ teams: { id: string; name: string }[] }>('/api/teams')
      .then(({ teams }) => setTeams(teams)).catch(() => {});
  }, []);

  // Load messages and members when channel changes
  useEffect(() => {
    if (!selectedId) return;
    setMessages([]);
    setMembers([]);

    messagesApi.listMessages(selectedId)
      .then(({ messages }) => setMessages([...messages].reverse()))
      .catch(() => {});

    apiFetch<{ conversation: { members?: ChannelMember[] } }>(`/api/conversations/${selectedId}`)
      .then(({ conversation }) => setMembers(conversation.members ?? []))
      .catch(() => {});
  }, [selectedId]);

  // Real-time new messages
  useEffect(() => {
    if (!socket) return;
    const handler = (msg: Message) => {
      if (msg.conversationId !== selectedId) return;
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
    };
    socket.on('message:new', handler);
    return () => { socket.off('message:new', handler); };
  }, [socket, selectedId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: { preventDefault(): void }) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId) return;
    setSending(true);
    try {
      if (socket) {
        socket.emit('message:send', { conversationId: selectedId, ciphertext: encodeMessageText(text), type: 'text' },
          (res: { ok: boolean; message?: Message }) => {
            if (res.ok && res.message) {
              setMessages((prev) => prev.some((m) => m.id === res.message!.id) ? prev : [...prev, res.message!]);
            }
          });
      } else {
        const { message } = await messagesApi.sendMessage({ conversationId: selectedId, ciphertext: encodeMessageText(text) });
        setMessages((prev) => [...prev, message]);
      }
      setDraft('');
    } finally {
      setSending(false);
    }
  }

  // Build grouped channel list
  const channels = conversations.filter((c) =>
    !search || (c.name ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const groups: ChannelGroup[] = [
    {
      label: 'General',
      icon: <IconGlobe width={11} height={11} />,
      channels: channels.filter((c) => !c.team_id),
    },
    ...teams
      .map((t) => ({
        label: t.name,
        icon: <IconBuilding width={11} height={11} />,
        channels: channels.filter((c) => c.team_id === t.id),
      }))
      .filter((g) => g.channels.length > 0),
  ];

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const isAdmin = user?.role === 'admin' || members.find((m) => m.user_id === user?.id)?.role === 'owner';

  return (
    <div className="flex-1 flex overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── LEFT: channel list ── */}
      <div className="flex flex-col flex-shrink-0" style={{ width: 260, borderRight: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-4">
            <IconMegaphone width={16} height={16} style={{ color: 'var(--accent)' }} />
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>Announcements</h1>
          </div>
          <div className="relative">
            <IconSearch width={13} height={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a channel…"
              className="w-full pl-8 pr-3 py-2 rounded-lg text-[14px] focus:outline-none"
              style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {groups.map((g) => g.channels.length > 0 && (
            <div key={g.label} className="mb-3">
              <div className="flex items-center gap-1.5 px-4 py-1">
                <span style={{ color: 'var(--text-dim)' }}>{g.icon}</span>
                <span className="font-mono text-[9.5px] uppercase tracking-widest font-bold truncate" style={{ color: 'var(--text-dim)' }}>
                  {g.label}
                </span>
              </div>
              {g.channels.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button key={c.id} onClick={() => setSelectedId(c.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors"
                    style={{ background: active ? 'var(--accent-wash)' : 'transparent' }}>
                    <span className="text-[14px] flex-shrink-0">📢</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium truncate" style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {c.name ?? 'Unnamed'}
                      </p>
                    </div>
                    {(c.unread_count ?? 0) > 0 && (
                      <span className="font-mono text-[12px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--accent)', color: '#ffffff' }}>
                        {c.unread_count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {groups.every((g) => g.channels.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 px-6 text-center">
              <IconMegaphone width={32} height={32} style={{ color: 'var(--text-dim)', opacity: 0.4 }} />
              <p className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
                No announcement channels yet
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── CENTER: channel feed ── */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--bg)' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
            <span className="text-xl">📢</span>
            <div className="flex-1 min-w-0">
              <p className="text-[18px] font-semibold truncate" style={{ color: 'var(--text)' }}>{selected.name}</p>
              <p className="text-[14px]" style={{ color: 'var(--text-dim)' }}>
                {selected.description ?? 'Broadcast channel'} · {members.length} subscribers
              </p>
            </div>
            <button onClick={() => setShowInfo((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[14px] font-mono transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <IconUsers width={12} height={12} /> {members.length}
            </button>
          </div>

          {/* Channel-only notice for non-admins */}
          {!isAdmin && (
            <div className="flex items-center gap-2 px-6 py-2 flex-shrink-0" style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
              <IconLock width={12} height={12} style={{ color: 'var(--text-dim)' }} />
              <p className="text-[13px] font-mono" style={{ color: 'var(--text-dim)' }}>
                This is a broadcast channel — only admins and owners can post
              </p>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5" style={{ background: 'var(--bg)' }}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <span className="text-4xl opacity-30">📢</span>
                <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>No announcements yet</p>
              </div>
            )}
            {messages.map((m) => {
              const sender = members.find((mb) => mb.user_id === m.senderId);
              const isMe = m.senderId === user?.id;
              return (
                <div key={m.id} className="flex gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-[13px]"
                    style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                    {(sender?.display_name ?? 'U').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[15px] font-semibold" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                        {sender?.display_name ?? 'Unknown'}
                      </span>
                      <span className="font-mono text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
                        {new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="rounded-xl px-4 py-3 inline-block max-w-[85%]"
                      style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
                      <p className="text-[15px] whitespace-pre-wrap break-words leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {m.deletedAt ? <em style={{ color: 'var(--text-dim)' }}>Message deleted</em> : decodeMessageText(m.ciphertext)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composer — only visible to admins/owners */}
          {isAdmin && (
            <form onSubmit={handleSend} className="flex items-center gap-3 px-6 py-4 flex-shrink-0"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--panel)' }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                placeholder={`Post to ${selected.name}…`}
                className="flex-1 rounded-lg px-4 py-2.5 text-[15px] focus:outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              <button type="submit" disabled={!draft.trim() || sending}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-mono text-[14.5px] font-medium disabled:opacity-40 transition-opacity"
                style={{ background: 'var(--accent)', color: '#ffffff', border: '1px solid var(--accent)' }}>
                <IconSend width={13} height={13} /> Post
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ background: 'var(--bg)' }}>
          <IconMegaphone width={48} height={48} style={{ color: 'var(--text-dim)', opacity: 0.3 }} />
          <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Select a channel to read announcements</p>
        </div>
      )}

      {/* ── RIGHT: subscriber list ── */}
      {selected && showInfo && members.length > 0 && (
        <div className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: 240, borderLeft: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="font-mono text-[12.5px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
              Subscribers · {members.length}
            </p>
          </div>
          <div className="overflow-y-auto flex-1 py-3">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2.5 px-4 py-2">
                <div className="w-8 h-8 rounded-md flex items-center justify-center font-mono font-bold text-[12px] flex-shrink-0"
                  style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                  {m.display_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] truncate" style={{ color: 'var(--text)' }}>{m.display_name}</p>
                  <p className="font-mono text-[12px]" style={{ color: 'var(--text-dim)' }}>@{m.username}</p>
                </div>
                {(m.role === 'owner' || m.role === 'admin') && (
                  <span className="font-mono text-[9.5px] uppercase px-1.5 py-0.5 rounded border"
                    style={{ color: 'var(--warning)', borderColor: 'var(--warning-border)', background: 'var(--warning-wash)' }}>
                    {m.role}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
