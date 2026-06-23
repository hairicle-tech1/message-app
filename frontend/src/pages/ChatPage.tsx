import { useEffect, useState } from 'react';
import * as conversationsApi from '../api/conversations';
import * as teamsApi from '../api/teams';
import type { Conversation, Message, Team } from '../api/types';
import { ConversationList } from '../components/ConversationList';
import { MessageThread } from '../components/MessageThread';
import { NewConversationDialog } from '../components/NewConversationDialog';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export function ChatPage() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presence, setPresence] = useState<Record<string, 'online' | 'offline'>>({});
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [showNewTeam, setShowNewTeam] = useState(false);

  useEffect(() => {
    conversationsApi.listConversations().then(({ conversations }) => {
      setConversations(conversations);
      setSelectedId((current) => current ?? conversations[0]?.id ?? null);
    });
    teamsApi.listMyTeams().then(({ teams }) => setTeams(teams)).catch(() => {});
  }, []);

  const filteredConversations = selectedTeamId
    ? conversations.filter((c) => c.team_id === selectedTeamId)
    : conversations;

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    const { team } = await teamsApi.createTeam({ name: newTeamName.trim() });
    setTeams((prev) => [...prev, team]);
    setNewTeamName('');
    setShowNewTeam(false);
  }

  useEffect(() => {
    if (!socket) return;

    const handlePresenceInit = (payload: { onlineUserIds: string[] }) => {
      const snapshot: Record<string, 'online' | 'offline'> = {};
      for (const id of payload.onlineUserIds) snapshot[id] = 'online';
      setPresence(snapshot);
    };

    const handlePresence = (payload: { userId: string; status: 'online' | 'offline' }) => {
      setPresence((prev) => ({ ...prev, [payload.userId]: payload.status }));
    };

    const handleNewMessage = (message: Message) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === message.conversationId);
        if (idx === -1) return prev;
        const updated = [...prev];
        const [conv] = updated.splice(idx, 1);
        updated.unshift({ ...conv, updated_at: message.createdAt });
        return updated;
      });
    };

    const requestPresence = () => socket.emit('presence:get');

    socket.on('presence:init', handlePresenceInit);
    socket.on('presence:update', handlePresence);
    socket.on('message:new', handleNewMessage);
    socket.on('connect', requestPresence);

    if (socket.connected) {
      requestPresence();
    }

    return () => {
      socket.off('presence:init', handlePresenceInit);
      socket.off('presence:update', handlePresence);
      socket.off('message:new', handleNewMessage);
      socket.off('connect', requestPresence);
    };
  }, [socket]);

  function handleConversationCreated(conversation: Conversation) {
    setConversations((prev) => {
      if (prev.some((c) => c.id === conversation.id)) return prev;
      return [conversation, ...prev];
    });
    setSelectedId(conversation.id);
    setMobileSidebarOpen(false);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setMobileSidebarOpen(false);
  }

  if (!user) return null;

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`flex-col w-72 shrink-0 bg-slate-900 border-r border-slate-800 ${
          mobileSidebarOpen ? 'flex' : 'hidden'
        } md:flex`}
      >
        {/* User header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <span className="flex-1 text-sm font-semibold text-white truncate">{user.displayName}</span>
          <button
            onClick={logout}
            className="text-xs text-slate-400 hover:text-white transition-colors flex-shrink-0"
          >
            Sign out
          </button>
        </div>

        {/* Teams section — always visible */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Teams</span>
            <button
              onClick={() => setShowNewTeam((v) => !v)}
              className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-sm"
              title="New team"
            >
              +
            </button>
          </div>

          {/* New team form */}
          {showNewTeam && (
            <form onSubmit={handleCreateTeam} className="flex gap-1 mb-2">
              <input
                autoFocus
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g. Sales Team"
                className="flex-1 bg-slate-700 text-white text-xs rounded-lg px-2 py-1.5 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button type="submit" className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium">
                Add
              </button>
            </form>
          )}

          {teams.length === 0 ? (
            <p className="text-xs text-slate-600 italic px-1">No teams yet — click + to create one</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedTeamId(null)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selectedTeamId === null
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                }`}
              >
                All
              </button>
              {teams.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTeamId(t.id === selectedTeamId ? null : t.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    selectedTeamId === t.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Section label */}
        <div className="px-4 pt-3 pb-1 flex-shrink-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {selectedTeamId ? teams.find((t) => t.id === selectedTeamId)?.name : 'All Messages'}
          </span>
        </div>

        {/* Conversation list */}
        <ConversationList
          conversations={filteredConversations}
          selectedId={selectedId}
          currentUserId={user.id}
          presence={presence}
          onSelect={handleSelect}
        />

        {/* New conversation button */}
        <div className="p-3 border-t border-slate-800 flex-shrink-0">
          <NewConversationDialog onCreated={handleConversationCreated} />
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 flex flex-col min-w-0 ${
          !mobileSidebarOpen ? 'flex' : 'hidden'
        } md:flex`}
      >
        {selectedId ? (
          <MessageThread
            key={selectedId}
            conversationId={selectedId}
            presence={presence}
            onBack={() => setMobileSidebarOpen(true)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-300" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
              </svg>
            </div>
            <p className="text-sm">Select or start a conversation</p>
          </div>
        )}
      </main>
    </div>
  );
}
