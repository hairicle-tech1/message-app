import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, getAuthToken, API_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import type { Message } from '../api/types';
import { decodeMessageText, encodeMessageText } from '../utils/text';

// ── Types (aligned to actual API responses) ───────────────────────────────────
interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  myRole: string;
  unreadCount?: number;
}

interface TeamMember {
  userId: string;       // API returns userId, not id
  displayName: string;
  username: string;
  role: string;
}

interface PinnedItem {
  id: string;
  type: 'file' | 'link';
  title: string;
  url: string;
  sizeKb?: number;
  addedBy: string;
  addedAt: string;
}

interface TeamMessage {
  id: string;
  userId: string | null;
  displayName: string;
  content: string;   // base64 ciphertext
  createdAt: string;
  attachment?: { name: string; sizeKb: number };
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconUsers(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><circle cx="9" cy="7" r="3.2"/><path d="M2.5 19c0-3.3 3-5.5 6.5-5.5S15.5 15.7 15.5 19"/><circle cx="17" cy="8.5" r="2.5"/><path d="M16 13.2c2.6.4 4.5 2.2 4.5 5"/></svg>; }
function IconPin(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z"/></svg>; }
function IconFile(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M14 3v5h5M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>; }
function IconLink(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/></svg>; }
function IconSearch(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>; }
function IconPaperclip(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M21.4 11.4l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></svg>; }
function IconSend(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>; }
function IconClose(p: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>; }

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'warning' }) {
  const styles = {
    neutral: 'text-[var(--text-muted)] border-[var(--border)]',
    accent:  'text-[var(--accent)] border-[var(--accent-dim)] bg-[var(--accent-wash)]',
    warning: 'text-[var(--warning)] border-[var(--warning-border)] bg-[var(--warning-wash)]',
  }[tone];
  return (
    <span className={`font-mono text-[10.5px] uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap ${styles}`}>
      {children}
    </span>
  );
}

export function TeamWorkspace() {
  const { user } = useAuth();
  const socket = useSocket();

  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  const [generalConvId, setGeneralConvId] = useState<string | null>(null);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pinned, setPinned] = useState<PinnedItem[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [showMembers, setShowMembers] = useState(true);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generalConvIdRef = useRef<string | null>(null);
  useEffect(() => { generalConvIdRef.current = generalConvId; }, [generalConvId]);

  // Load team list
  useEffect(() => {
    apiFetch<{ teams: TeamSummary[] }>('/api/teams')
      .then(({ teams }) => {
        setTeams(teams);
        if (teams.length > 0) setActiveTeamId(teams[0].id);
      })
      .catch(() => {});
  }, []);

  // Load team data when active team changes
  useEffect(() => {
    if (!activeTeamId) return;
    setMessages([]);
    setMembers([]);
    setPinned([]);

    apiFetch<{ members: TeamMember[] }>(`/api/teams/${activeTeamId}/members`)
      .then(({ members }) => setMembers(members))
      .catch(() => {});

    apiFetch<{ pinned: PinnedItem[] }>(`/api/teams/${activeTeamId}/pinned`)
      .then(({ pinned }) => setPinned(pinned))
      .catch(() => {});

    apiFetch<{ conversationId: string; messages: TeamMessage[] }>(`/api/teams/${activeTeamId}/messages`)
      .then(({ conversationId, messages }) => {
        setGeneralConvId(conversationId);
        setMessages(messages);
        if (messages.length > 0) {
          const lastMsg = messages[messages.length - 1];
          apiFetch(`/api/messages/${lastMsg.id}/read`, { method: 'POST' }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [activeTeamId]);

  // Real-time: listen for new messages in the General channel via socket
  useEffect(() => {
    if (!socket) return;
    const handler = (msg: Message) => {
      if (msg.conversationId !== generalConvIdRef.current) return;
      // Convert from Message shape to TeamMessage shape
      const teamMsg: TeamMessage = {
        id: msg.id,
        userId: msg.senderId,
        displayName: (msg as unknown as { senderDisplayName?: string }).senderDisplayName ?? 'Unknown',
        content: msg.ciphertext,
        createdAt: msg.createdAt,
      };
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, teamMsg]);
    };
    socket.on('message:new', handler);
    return () => { socket.off('message:new', handler); };
  }, [socket]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: { preventDefault(): void }) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !activeTeamId) return;
    setSending(true);
    const encoded = encodeMessageText(text);

    // Use the standard socket message:send so all members get real-time delivery
    if (socket && generalConvId) {
      socket.emit(
        'message:send',
        { conversationId: generalConvId, ciphertext: encoded, type: 'text' },
        (res: { ok: boolean; message?: Message }) => {
          if (res.ok && res.message) {
            const teamMsg: TeamMessage = {
              id: res.message.id,
              userId: res.message.senderId,
              displayName: user?.displayName ?? 'Me',
              content: res.message.ciphertext,
              createdAt: res.message.createdAt,
            };
            setMessages((prev) => prev.some((m) => m.id === teamMsg.id) ? prev : [...prev, teamMsg]);
          }
          setSending(false);
        },
      );
    } else {
      // Fallback: REST
      try {
        const { message } = await apiFetch<{ message: TeamMessage }>(`/api/teams/${activeTeamId}/messages`, {
          method: 'POST', body: JSON.stringify({ content: encoded }),
        });
        setMessages((prev) => [...prev, message]);
      } finally {
        setSending(false);
      }
    }
    setDraft('');
  }

  async function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeTeamId) return;

    // Upload file first, then send as message via existing /api/files flow
    const fd = new FormData();
    fd.append('file', file);
    const uploadRes = await fetch(`${API_URL}/api/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      body: fd,
    });
    const { file: fileMeta } = await uploadRes.json() as { file: { id: string; fileName: string; sizeBytes: number } };

    const { message } = await apiFetch<{ message: TeamMessage }>(`/api/teams/${activeTeamId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: encodeMessageText(`📎 ${fileMeta.fileName}`) }),
    });
    setMessages((prev) => [...prev, { ...message, attachment: { name: fileMeta.fileName, sizeKb: Math.round(fileMeta.sizeBytes / 1024) } }]);
  }

  const filteredTeams = teams.filter((t) =>
    !teamSearch || t.name.toLowerCase().includes(teamSearch.toLowerCase()),
  );
  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  return (
    <div className="flex-1 flex overflow-hidden team-root" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── LEFT: team list ── */}
      <div className="flex flex-col flex-shrink-0" style={{ width: 260, borderRight: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div className="px-5 pt-6 pb-4">
          <h1 className="text-[22px] font-bold tracking-tight mb-3" style={{ color: 'var(--text)' }}>Teams</h1>
          <div className="relative">
            <IconSearch width={14} height={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
            <input value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)}
              placeholder="Find a team…" className="input-base w-full pl-8" style={{ fontSize: 14 }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {filteredTeams.map((t) => {
            const active = t.id === activeTeamId;
            return (
              <button key={t.id} onClick={() => setActiveTeamId(t.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors mb-0.5"
                style={{ background: active ? 'var(--accent-wash)' : 'transparent' }}>
                <div className="team-icon" style={{ borderColor: active ? 'var(--accent-dim)' : 'var(--border)', color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {t.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium truncate" style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}>{t.name}</p>
                  <p className="font-mono text-[12px]" style={{ color: 'var(--text-dim)' }}>
                    {t.memberCount} member{t.memberCount !== 1 ? 's' : ''} · {t.myRole}
                  </p>
                </div>
                {(t.unreadCount ?? 0) > 0 && !active && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'var(--danger)', color: '#fff', minWidth: 18, textAlign: 'center' }}>
                    {t.unreadCount! > 99 ? '99+' : t.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
          {filteredTeams.length === 0 && (
            <p className="text-center text-[14px] py-8" style={{ color: 'var(--text-dim)' }}>No teams found</p>
          )}
        </div>
      </div>

      {/* ── CENTER: General channel ── */}
      {activeTeam ? (
        <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--bg)' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div className="team-icon" style={{ width: 36, height: 36, fontSize: 14 }}>
              {activeTeam.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[18px] font-semibold" style={{ color: 'var(--text)' }}>{activeTeam.name}</p>
              <p className="text-[13.5px]" style={{ color: 'var(--text-dim)' }}>
                {activeTeam.description ?? 'General channel'}
              </p>
            </div>
            <button onClick={() => setShowMembers((v) => !v)} className="btn-ghost">
              <IconUsers width={13} height={13} /> {members.length}
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-0.5" style={{ background: 'var(--bg)' }}>
            {messages.length === 0 && (
              <p className="text-center text-[14px] m-auto" style={{ color: 'var(--text-dim)' }}>
                No messages yet — say something to {activeTeam.name}
              </p>
            )}
            {messages.map((m, i) => {
              const isMe = m.userId === user?.id;
              const prev = messages[i - 1];
              const next = messages[i + 1];

              // Grouping: same sender within 3 minutes = grouped
              const sameAsPrev = prev?.userId === m.userId &&
                (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 3 * 60 * 1000;
              const sameAsNext = next?.userId === m.userId &&
                (new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime()) < 3 * 60 * 1000;

              // First bubble in a group gets the "pointy" corner (6px) on the avatar side
              // Subsequent bubbles get fully rounded (16px all around)
              const R = 16; // base radius
              const POINT = 6; // sharp corner pointing toward avatar
              const borderRadius = isMe
                ? `${R}px ${sameAsPrev ? R : POINT}px ${sameAsNext ? R : R}px ${R}px`
                : `${sameAsPrev ? R : POINT}px ${R}px ${R}px ${sameAsNext ? R : R}px`;

              return (
                <div key={m.id}
                  className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'} ${sameAsPrev ? 'mt-0.5' : 'mt-3'}`}>

                  {/* Avatar — only on first message in group */}
                  <div className="flex-shrink-0 w-7 h-7" style={{ visibility: sameAsPrev ? 'hidden' : 'visible' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-[12px]"
                      style={{
                        background: isMe ? 'var(--accent-dim)' : 'var(--panel-alt)',
                        border: '1px solid var(--border)',
                        color: isMe ? '#fff' : 'var(--accent)',
                      }}>
                      {m.displayName.slice(0, 1).toUpperCase()}
                    </div>
                  </div>

                  {/* Bubble column — max 62% width */}
                  <div className="flex flex-col" style={{ maxWidth: '62%', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    {/* Sender name + time — only on first in group */}
                    {!sameAsPrev && (
                      <div className={`flex items-baseline gap-2 mb-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                        <span className="text-[13px] font-semibold" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                          {isMe ? 'You' : m.displayName}
                        </span>
                        <span className="font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}

                    {/* Bubble */}
                    <div style={{
                      background: isMe ? 'var(--accent)' : 'var(--panel)',
                      border: isMe ? 'none' : '1px solid var(--border)',
                      borderRadius,
                      padding: '8px 13px',
                    }}>
                      {m.content && (
                        <p className="text-[14px]" style={{ color: isMe ? '#fff' : 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {decodeMessageText(m.content)}
                        </p>
                      )}
                      {m.attachment && (
                        <div className="inline-flex items-center gap-2 px-2 py-1.5 rounded-lg"
                          style={{ background: isMe ? 'rgba(255,255,255,0.15)' : 'var(--panel-alt)', border: `1px solid ${isMe ? 'rgba(255,255,255,0.2)' : 'var(--border)'}` }}>
                          <IconFile width={13} height={13} style={{ color: isMe ? '#fff' : 'var(--text-muted)', flexShrink: 0 }} />
                          <span className="text-[13px]" style={{ color: isMe ? '#fff' : 'var(--text)' }}>{m.attachment.name}</span>
                          <span className="font-mono text-[11px]" style={{ color: isMe ? 'rgba(255,255,255,0.6)' : 'var(--text-dim)' }}>{m.attachment.sizeKb} KB</span>
                        </div>
                      )}
                      {/* Timestamp on last bubble in group */}
                      {!sameAsNext && sameAsPrev && (
                        <p className="font-mono text-[10px] mt-1" style={{ color: isMe ? 'rgba(255,255,255,0.55)' : 'var(--text-dim)', textAlign: isMe ? 'right' : 'left' }}>
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Spacer to mirror avatar on isMe side */}
                  <div className="w-7 flex-shrink-0" />
                </div>
              );
            })}
          </div>

          {/* Composer */}
          <form onSubmit={handleSend} className="flex items-center gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--panel)' }}>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-icon" title="Attach file">
              <IconPaperclip width={15} height={15} />
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttach} />
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
              placeholder={`Message ${activeTeam.name}…`}
              className="input-base flex-1" />
            <button type="submit" disabled={!draft.trim() || sending} className="btn-primary disabled:opacity-40">
              <IconSend width={13} height={13} />
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Select a team to open its workspace</p>
        </div>
      )}

      {/* ── RIGHT: members + pinned ── */}
      {activeTeam && showMembers && (
        <div className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: 260, borderLeft: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="font-mono text-[13px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Workspace</span>
            <button onClick={() => setShowMembers(false)} className="btn-icon" style={{ width: 22, height: 22 }}>
              <IconClose width={11} height={11} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {/* Pinned shelf */}
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-3">
                <IconPin width={13} height={13} style={{ color: 'var(--text-dim)' }} />
                <span className="font-mono text-[12.5px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>Pinned</span>
              </div>
              {pinned.length > 0 ? (
                <div className="space-y-1.5">
                  {pinned.map((p) => (
                    <a key={p.id} href={p.url || '#'} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors"
                      style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
                      {p.type === 'file'
                        ? <IconFile width={13} height={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        : <IconLink width={13} height={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                      <div className="min-w-0">
                        <p className="text-[13.5px] truncate" style={{ color: 'var(--text)' }}>{p.title}</p>
                        <p className="font-mono text-[12px]" style={{ color: 'var(--text-dim)' }}>
                          {p.sizeKb ? `${p.sizeKb} KB · ` : ''}{p.addedBy}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] italic" style={{ color: 'var(--text-dim)' }}>Nothing pinned yet</p>
              )}
            </div>

            {/* Member roster */}
            <div className="px-5 py-4">
              <span className="font-mono text-[12.5px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                Members · {members.length}
              </span>
              <div className="mt-3 space-y-2.5">
                {members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-2.5">
                    <div className="avatar-box" style={{ width: 24, height: 24 }}>
                      {m.displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] truncate" style={{ color: 'var(--text)' }}>{m.displayName}</p>
                      <p className="font-mono text-[12px] truncate" style={{ color: 'var(--text-dim)' }}>@{m.username}</p>
                    </div>
                    {(m.role === 'admin' || m.role === 'manager' || m.role === 'owner') && (
                      <Badge tone="warning">{m.role}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .team-root * { box-sizing: border-box; }
        .team-icon { width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-family: monospace; font-weight: 700; font-size: 14px; color: var(--text-muted); flex-shrink: 0; background: var(--panel); }
        .avatar-box { width: 32px; height: 32px; border-radius: 7px; background: var(--panel-alt); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-family: monospace; font-size: 13px; font-weight: 700; color: var(--accent); flex-shrink: 0; }
        .input-base { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; font-size: 15px; color: var(--text); outline: none; }
        .input-base:focus { border-color: var(--accent-dim); }
        .btn-primary { display: inline-flex; align-items: center; gap: 7px; font-family: monospace; font-size: 14px; font-weight: 500; padding: 10px 15px; border-radius: 8px; cursor: pointer; background: var(--accent); color: #ffffff; border: 1px solid var(--accent); transition: opacity 0.15s; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-ghost { display: inline-flex; align-items: center; gap: 7px; font-family: monospace; font-size: 14px; font-weight: 500; padding: 8px 13px; border-radius: 8px; cursor: pointer; background: transparent; color: var(--text-muted); border: 1px solid var(--border); transition: all 0.15s; }
        .btn-ghost:hover { color: var(--text); border-color: var(--text-dim); }
        .btn-icon { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border); border-radius: 8px; color: var(--text-muted); cursor: pointer; transition: all 0.15s; flex-shrink: 0; }
        .btn-icon:hover { border-color: var(--text-dim); color: var(--text); }
      `}</style>
    </div>
  );
}

// CSS variables now come from index.css — no hardcoded values needed here
