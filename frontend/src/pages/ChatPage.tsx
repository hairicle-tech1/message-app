import { useEffect, useState } from 'react';
import * as conversationsApi from '../api/conversations';
import type { Conversation, Message } from '../api/types';
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

  useEffect(() => {
    conversationsApi.listConversations().then(({ conversations }) => {
      setConversations(conversations);
      setSelectedId((current) => current ?? conversations[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!socket) return;

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

    socket.on('presence:update', handlePresence);
    socket.on('message:new', handleNewMessage);

    return () => {
      socket.off('presence:update', handlePresence);
      socket.off('message:new', handleNewMessage);
    };
  }, [socket]);

  function handleConversationCreated(conversation: Conversation) {
    setConversations((prev) => {
      if (prev.some((c) => c.id === conversation.id)) return prev;
      return [conversation, ...prev];
    });
    setSelectedId(conversation.id);
  }

  if (!user) return null;

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span>{user.displayName}</span>
          <button className="link-button" onClick={logout}>
            Log out
          </button>
        </div>

        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          currentUserId={user.id}
          presence={presence}
          onSelect={setSelectedId}
        />

        <NewConversationDialog onCreated={handleConversationCreated} />
      </aside>

      <main className="chat-main">
        {selectedId ? (
          <MessageThread key={selectedId} conversationId={selectedId} presence={presence} />
        ) : (
          <div className="empty-state">Select or start a conversation</div>
        )}
      </main>
    </div>
  );
}
