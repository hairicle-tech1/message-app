import type { Conversation } from '../api/types';
import { getConversationTitle, getOtherMember } from '../utils/conversation';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  currentUserId: string;
  presence: Record<string, 'online' | 'offline'>;
  onSelect: (id: string) => void;
}

export function ConversationList({
  conversations,
  selectedId,
  currentUserId,
  presence,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return <p className="px-4 py-3 text-sm text-slate-500">No conversations yet.</p>;
  }

  return (
    <ul className="flex-1 overflow-y-auto py-1 px-2 space-y-0.5">
      {conversations.map((conversation) => {
        const title = getConversationTitle(conversation, currentUserId);
        const other = conversation.type === 'direct' ? getOtherMember(conversation, currentUserId) : null;
        const isOnline = other ? presence[other.user_id] === 'online' : false;
        const isActive = conversation.id === selectedId;

        return (
          <li key={conversation.id}>
            <button
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
              onClick={() => onSelect(conversation.id)}
            >
              {/* Avatar with presence dot */}
              <span
                className={`relative flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                  isActive ? 'bg-indigo-400 text-white' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {title.slice(0, 1).toUpperCase()}
                {other && (
                  <span
                    className={`absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 ${
                      isActive ? 'border-indigo-600' : 'border-slate-900'
                    } ${isOnline ? 'bg-emerald-500' : 'bg-slate-600'}`}
                  />
                )}
              </span>

              {/* Name + type */}
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate leading-tight">{title}</span>
                <span
                  className={`text-xs truncate capitalize ${
                    isActive ? 'text-indigo-200' : 'text-slate-500'
                  }`}
                >
                  {conversation.type === 'group'
                    ? 'Group'
                    : conversation.type === 'channel'
                      ? 'Channel'
                      : 'Direct'}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
