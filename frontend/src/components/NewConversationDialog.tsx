import { useEffect, useState, type FormEvent } from 'react';
import * as conversationsApi from '../api/conversations';
import { ApiError } from '../api/client';
import type { Conversation, DirectoryUser } from '../api/types';

interface NewConversationDialogProps {
  onCreated: (conversation: Conversation) => void;
}

type Mode = 'direct' | 'group';

export function NewConversationDialog({ onCreated }: NewConversationDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('direct');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);

  useEffect(() => {
    if (!open) return;

    conversationsApi
      .listDirectory()
      .then(({ users }) => setUsers(users))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load directory'));
  }, [open]);

  function close() {
    setOpen(false);
    setMode('direct');
    setError(null);
    setGroupName('');
    setSelectedIds(new Set());
  }

  async function startDirectConversation(userId: string) {
    setError(null);
    setCreatingId(userId);

    try {
      const { conversation } = await conversationsApi.createConversation({
        type: 'direct',
        memberIds: [userId],
      });
      onCreated(conversation);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start conversation');
    } finally {
      setCreatingId(null);
    }
  }

  function toggleSelected(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    if (!groupName.trim() || selectedIds.size === 0) return;

    setError(null);
    setCreatingGroup(true);

    try {
      const { conversation } = await conversationsApi.createConversation({
        type: 'group',
        name: groupName.trim(),
        memberIds: [...selectedIds],
      });
      onCreated(conversation);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  }

  if (!open) {
    return (
      <button className="new-conversation-toggle" onClick={() => setOpen(true)}>
        + New conversation
      </button>
    );
  }

  return (
    <div className="new-conversation-panel">
      <div className="new-conversation-header">
        <span>Start a conversation</span>
        <button className="link-button" onClick={close}>
          Close
        </button>
      </div>

      <div className="new-conversation-tabs">
        <button
          type="button"
          className={`tab-button ${mode === 'direct' ? 'active' : ''}`}
          onClick={() => setMode('direct')}
        >
          Direct message
        </button>
        <button
          type="button"
          className={`tab-button ${mode === 'group' ? 'active' : ''}`}
          onClick={() => setMode('group')}
        >
          Group chat
        </button>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {mode === 'direct' ? (
        <ul className="directory-list">
          {users.map((user) => (
            <li key={user.id}>
              <button
                className="directory-item"
                onClick={() => startDirectConversation(user.id)}
                disabled={creatingId === user.id}
              >
                <span className="conversation-avatar">{user.display_name.slice(0, 1).toUpperCase()}</span>
                <span className="conversation-meta">
                  <span className="conversation-title">{user.display_name}</span>
                  <span className="conversation-type">@{user.username}</span>
                </span>
              </button>
            </li>
          ))}
          {users.length === 0 && !error && <li className="conversation-list-empty">No other users found.</li>}
        </ul>
      ) : (
        <form className="group-form" onSubmit={createGroup}>
          <input
            className="group-name-input"
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />

          <ul className="directory-list">
            {users.map((user) => (
              <li key={user.id}>
                <label className="directory-item directory-item-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(user.id)}
                    onChange={() => toggleSelected(user.id)}
                  />
                  <span className="conversation-avatar">{user.display_name.slice(0, 1).toUpperCase()}</span>
                  <span className="conversation-meta">
                    <span className="conversation-title">{user.display_name}</span>
                    <span className="conversation-type">@{user.username}</span>
                  </span>
                </label>
              </li>
            ))}
            {users.length === 0 && !error && <li className="conversation-list-empty">No other users found.</li>}
          </ul>

          <button
            type="submit"
            className="group-create-button"
            disabled={!groupName.trim() || selectedIds.size === 0 || creatingGroup}
          >
            {creatingGroup ? 'Creating...' : `Create group${selectedIds.size ? ` (${selectedIds.size + 1} members)` : ''}`}
          </button>
        </form>
      )}
    </div>
  );
}
