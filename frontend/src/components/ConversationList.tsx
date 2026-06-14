import type { Conversation } from '../api/types';
import { getConversationTitle, getOtherMember } from '../utils/conversation';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  currentUserId: string;
  presence: Record<string, 'online' | 'offline'>;
  onSelect: (id: string) => void;
}

export function ConversationList({ conversations, selectedId, currentUserId, presence, onSelect }: ConversationListProps) {
  if (conversations.length === 0) {
    return <p className="conversation-list-empty">No conversations yet. Start one below.</p>;
  }

  return (
    <ul className="conversation-list">
      {conversations.map((conversation) => {
        const title = getConversationTitle(conversation, currentUserId);
        const other = conversation.type === 'direct' ? getOtherMember(conversation, currentUserId) : null;
        const isOnline = other ? presence[other.user_id] === 'online' : false;

        return (
          <li key={conversation.id}>
            <button
              className={`conversation-item ${conversation.id === selectedId ? 'active' : ''}`}
              onClick={() => onSelect(conversation.id)}
            >
              <span className="conversation-avatar">
                {title.slice(0, 1).toUpperCase()}
                {other && <span className={`presence-dot ${isOnline ? 'online' : 'offline'}`} />}
              </span>
              <span className="conversation-meta">
                <span className="conversation-title">{title}</span>
                <span className="conversation-type">{conversation.type}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
