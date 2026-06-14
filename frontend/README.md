# Messenger Frontend

React + TypeScript + Vite web client for the Messenger App (Phases 1-3): login,
conversation list, direct/group chats, real-time messaging via Socket.IO, file
uploads, and voice notes.

## Setup

```bash
cp .env.example .env   # set VITE_API_URL (defaults to http://localhost:4000)
npm install
npm run dev             # http://localhost:5173
```

Requires the backend (see [../backend/README.md](../backend/README.md)) running
and reachable at `VITE_API_URL`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

## Structure

```
src/
  api/          REST clients (auth, users, conversations, messages, files)
  components/   ConversationList, MessageThread, MessageAttachment, NewConversationDialog
  context/      AuthContext (JWT/session), SocketContext (Socket.IO connection)
  hooks/        useFileBlobUrl (authenticated media fetch + object URL cache)
  pages/        LoginPage, ChatPage
  utils/        conversation title helpers, message text encode/decode, file size formatting
```

## Notes

- Auth token + device id are persisted in `localStorage`; session is restored
  via `GET /api/auth/me` on load.
- Messages are currently base64-encoded plaintext in the `ciphertext` field —
  real end-to-end encryption (Signal Protocol) is planned for a later phase.
- File/image/video/audio attachments and voice notes are fetched as
  authenticated blobs (Bearer token) and rendered via object URLs.
