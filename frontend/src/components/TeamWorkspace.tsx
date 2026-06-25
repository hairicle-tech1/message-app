import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, getAuthToken, API_URL } from '../api/client';
import { decodeMessageText, encodeMessageText } from '../utils/text';

// ── Types (aligned to actual API responses) ───────────────────────────────────
interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  myRole: string;
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
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [teamSearch, setTeamSearch] = useState('');

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pinned, setPinned] = useState<PinnedItem[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [showMembers, setShowMembers] = useState(true);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    apiFetch<{ messages: TeamMessage[] }>(`/api/teams/${activeTeamId}/messages`)
      .then(({ messages }) => setMessages(messages))
      .catch(() => {});
  }, [activeTeamId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: { preventDefault(): void }) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !activeTeamId) return;
    setSending(true);
    try {
      const encoded = encodeMessageText(text);
      const { message } = await apiFetch<{ message: TeamMessage }>(`/api/teams/${activeTeamId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: encoded }),
      });
      setMessages((prev) => [...prev, message]);
      setDraft('');
    } catch {
      // surfaced via toast in real app
    } finally {
      setSending(false);
    }
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
    <div className="flex-1 flex overflow-hidden team-root" style={rootVars}>

      {/* ── LEFT: team list ── */}
      <div className="flex flex-col flex-shrink-0" style={{ width: 260, borderRight: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div className="px-5 pt-6 pb-4">
          <h1 className="text-[18px] font-bold tracking-tight mb-3" style={{ color: 'var(--text)' }}>Teams</h1>
          <div className="relative">
            <IconSearch width={13} height={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
            <input value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)}
              placeholder="Find a team…" className="input-base w-full pl-8" style={{ fontSize: 12.5 }} />
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
                  <p className="text-[13px] font-medium truncate" style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}>{t.name}</p>
                  <p className="font-mono text-[10.5px]" style={{ color: 'var(--text-dim)' }}>
                    {t.memberCount} member{t.memberCount !== 1 ? 's' : ''} · {t.myRole}
                  </p>
                </div>
              </button>
            );
          })}
          {filteredTeams.length === 0 && (
            <p className="text-center text-[12.5px] py-8" style={{ color: 'var(--text-dim)' }}>No teams found</p>
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
              <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{activeTeam.name}</p>
              <p className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
                {activeTeam.description ?? 'General channel'}
              </p>
            </div>
            <button onClick={() => setShowMembers((v) => !v)} className="btn-ghost">
              <IconUsers width={13} height={13} /> {members.length}
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4" style={{ background: 'var(--bg)' }}>
            {messages.length === 0 && (
              <p className="text-center text-[12.5px] m-auto" style={{ color: 'var(--text-dim)' }}>
                No messages yet — say something to {activeTeam.name}
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex gap-3">
                <div className="avatar-box flex-shrink-0">{m.displayName.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-[13px] font-medium" style={{ color: 'var(--text)' }}>{m.displayName}</span>
                    <span className="font-mono text-[10.5px]" style={{ color: 'var(--text-dim)' }}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {m.content && (
                    <p className="text-[13.5px]" style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
                      {decodeMessageText(m.content)}
                    </p>
                  )}
                  {m.attachment && (
                    <div className="inline-flex items-center gap-2 mt-1.5 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
                      <IconFile width={14} height={14} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-[12.5px]" style={{ color: 'var(--text)' }}>{m.attachment.name}</span>
                      <span className="font-mono text-[10.5px]" style={{ color: 'var(--text-dim)' }}>{m.attachment.sizeKb} KB</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
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
            <span className="font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Workspace</span>
            <button onClick={() => setShowMembers(false)} className="btn-icon" style={{ width: 22, height: 22 }}>
              <IconClose width={11} height={11} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {/* Pinned shelf */}
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-3">
                <IconPin width={12} height={12} style={{ color: 'var(--text-dim)' }} />
                <span className="font-mono text-[10.5px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>Pinned</span>
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
                        <p className="text-[12px] truncate" style={{ color: 'var(--text)' }}>{p.title}</p>
                        <p className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                          {p.sizeKb ? `${p.sizeKb} KB · ` : ''}{p.addedBy}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-[11.5px] italic" style={{ color: 'var(--text-dim)' }}>Nothing pinned yet</p>
              )}
            </div>

            {/* Member roster */}
            <div className="px-5 py-4">
              <span className="font-mono text-[10.5px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                Members · {members.length}
              </span>
              <div className="mt-3 space-y-2.5">
                {members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-2.5">
                    <div className="avatar-box" style={{ width: 24, height: 24 }}>
                      {m.displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] truncate" style={{ color: 'var(--text)' }}>{m.displayName}</p>
                      <p className="font-mono text-[10.5px] truncate" style={{ color: 'var(--text-dim)' }}>@{m.username}</p>
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
        .team-icon { width: 32px; height: 32px; border-radius: 7px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-family: monospace; font-weight: 700; font-size: 12px; color: var(--text-muted); flex-shrink: 0; background: var(--panel); }
        .avatar-box { width: 28px; height: 28px; border-radius: 6px; background: var(--panel-alt); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-family: monospace; font-size: 11px; font-weight: 700; color: var(--accent); flex-shrink: 0; }
        .input-base { background: var(--panel); border: 1px solid var(--border); border-radius: 7px; padding: 9px 12px; font-size: 13px; color: var(--text); outline: none; }
        .input-base:focus { border-color: var(--accent-dim); }
        .btn-primary { display: inline-flex; align-items: center; gap: 6px; font-family: monospace; font-size: 12.5px; font-weight: 500; padding: 9px 13px; border-radius: 7px; cursor: pointer; background: var(--accent); color: var(--bg-deep); border: 1px solid var(--accent); transition: opacity 0.15s; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-ghost { display: inline-flex; align-items: center; gap: 6px; font-family: monospace; font-size: 12px; font-weight: 500; padding: 7px 11px; border-radius: 7px; cursor: pointer; background: transparent; color: var(--text-muted); border: 1px solid var(--border); transition: all 0.15s; }
        .btn-ghost:hover { color: var(--text); border-color: var(--text-dim); }
        .btn-icon { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border); border-radius: 7px; color: var(--text-muted); cursor: pointer; transition: all 0.15s; flex-shrink: 0; }
        .btn-icon:hover { border-color: var(--text-dim); color: var(--text); }
      `}</style>
    </div>
  );
}

const rootVars: React.CSSProperties = {
  '--bg':            '#0B0E14',
  '--bg-deep':       '#080A0F',
  '--panel':         '#12161F',
  '--panel-alt':     '#161B26',
  '--border':        '#1E2330',
  '--text':          '#E7ECF3',
  '--text-muted':    '#8A98AC',
  '--text-dim':      '#5C6779',
  '--accent':        '#5EE6A8',
  '--accent-dim':    '#2B6E54',
  '--accent-wash':   'rgba(94,230,168,0.08)',
  '--warning':       '#F5A623',
  '--warning-border':'rgba(245,166,35,0.3)',
  '--warning-wash':  'rgba(245,166,35,0.08)',
  fontFamily: "'Inter', system-ui, sans-serif",
} as React.CSSProperties;
