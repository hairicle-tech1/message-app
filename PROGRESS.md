# Progress Timeline

Tracks what's been done on the Internal Messenger App, session by session.

---

## 2026-06-14 — Planning & Phase 1 (Foundation & Authentication)

### Planning
- [PLAN.md](PLAN.md) — full project plan: core features, tech stack, security
  rationale, 5-phase/10-week build timeline, Future Enhancements (voice/video calls)
- [docs/database-design.md](docs/database-design.md) — ERD (Mermaid) + PostgreSQL
  DDL covering users, devices, Signal key bundles, conversations, messages,
  deliveries, files, calls, audit logs

### Phase 1 — Backend Scaffold (`backend/`)
- Project structure: TypeScript + Express, `package.json`, `tsconfig.json`
- `docker-compose.yml`: Postgres 16 + Redis 7 (Postgres on host port `5433` to
  avoid clashing with an existing local Postgres install)
- `db/init.sql`: full schema applied from database design (+ `password_hash`
  for admin-provisioned local accounts)
- Config layer: env loader, Postgres pool, Redis client
- Middleware: JWT auth (`requireAuth`, `requireRole`), centralized error handler
- **Auth module**: `POST /api/auth/login`, `GET /api/auth/me`
- **Users module**: `GET/POST /api/users` (admin-only — enforces closed registration)
- Seed script for first admin user (`admin@company.local` / `ChangeMe123!`)
- Verified end-to-end: build, type-check, Docker stack up, login + JWT + `/me` +
  `/users` all working

### Status
✅ Phase 1 backend foundation working locally.

---

## 2026-06-14 — Phase 2 (Core Messaging)

- Auth: login now provisions/reuses a per-device record (`user_devices`) and
  embeds `deviceId` in the JWT, enabling per-device message delivery
- **Conversations module**: `POST/GET /api/conversations`,
  `GET /api/conversations/:id`, add/remove members — direct conversations are
  deduped (reuse existing 1:1 conversation), group/channel support owner/admin
  role checks
- **Messages module**: `POST /api/messages` (stores ciphertext + fans out a
  `message_deliveries` row per recipient device), `GET /api/messages`
  (paginated history via `before` cursor), `POST /api/messages/:id/read`
  (updates delivery status + `conversation_members.last_read_message_id`)
- **Real-time engine** (`src/realtime/socket.ts`, Socket.IO over the same HTTP
  server): JWT handshake auth, auto-joins per-conversation rooms, presence
  tracked via Redis counters (`presence:update` online/offline), typing
  indicators (`typing:start`/`typing:stop`), `message:send` / `message:read`
  with ack callbacks broadcasting `message:new` / `message:read`
- Verified end-to-end with two users (admin + a seeded "alice" account):
  created a direct conversation, sent messages via REST and via Socket.IO,
  confirmed real-time delivery, typing indicators, presence updates, and
  per-device read receipts in `message_deliveries`

### Status
✅ Phase 2 core messaging (conversations, messages, real-time) working locally.

---

## 2026-06-14 — Phase 2 Web Frontend (`frontend/`)

- Scaffolded with Vite + React + TypeScript (`react-router-dom`, `socket.io-client`)
- **Auth**: `AuthContext` handles login/logout, persists JWT + deviceId in
  localStorage, restores session via `/api/auth/me`
- **Realtime**: `SocketContext` opens a JWT-authenticated Socket.IO connection
- **Login page**: email/password form against `POST /api/auth/login`
- **Chat page**: sidebar conversation list (with online/offline presence dots)
  + "New conversation" picker backed by a company directory
- **Message thread**: history via `GET /api/messages`, live updates via
  `message:new`, typing indicators (`typing:start`/`stop`), read receipts
  (✓✓) via `message:read`
- Backend additions to support the UI:
  - `GET /api/users/directory` — any authenticated user can browse colleagues
    to start a DM (previously `/api/users` was admin-only)
  - `listConversations` now returns a `members` array so direct-conversation
    titles show the other person's name
- Messages are currently sent as base64-encoded plaintext in the `ciphertext`
  field (no E2E yet — see Phase 3)
- Both frontend and backend type-check cleanly; new endpoints verified via curl

### Status
✅ Minimal but functional web chat UI working against the Phase 1-2 backend
   (manual two-browser test pending from the user).

---

## 2026-06-14 — Phase 3 (Files & Voice Notes)

- **Backend `files` module**: `POST /api/files` (multer, multipart upload,
  25MB default limit) stores uploads on local disk under `UPLOADS_DIR`
  (`backend/uploads/`, gitignored) and records metadata in the existing
  `files` table; `GET /api/files/:id` streams the file back, authorized via
  conversation membership (or uploader-only before it's attached to a message)
- **Messages**: `sendMessage` accepts an optional `fileId` and atomically
  attaches the upload to the new message (`files.message_id`); `ciphertext`
  is now optional (defaults to empty) so file-only messages don't need a
  caption. `GET /api/messages` left-joins `files` so history includes
  attachment metadata
- Same `fileId` support added to the `message:send` Socket.IO event
- **Frontend**: paperclip button uploads any file and sends it as
  `image` / `video` / `audio` / `file` based on MIME type; mic button records
  a voice note via `MediaRecorder` (webm) and sends it as an `audio` message
- New `MessageAttachment` component renders inline images/video/audio players
  or a download link for generic files, fetched as authenticated blobs via
  `useFileBlobUrl` (Bearer token, object URL, cached)
- Verified end-to-end via curl: upload -> attach to message via
  `POST /api/messages` -> appears in `GET /api/messages` with file metadata
  -> download returns original bytes
- Local filesystem storage chosen over MinIO for now (see PLAN.md) to avoid
  extra Docker services during development; storage is abstracted behind the
  `files` table so swapping to MinIO/S3 later doesn't change the API

### Status
✅ File attachments and voice notes working end-to-end (backend verified via
   curl; frontend type-checks cleanly, manual browser test pending).

---

## 2026-06-14 — Frontend: Group Chat Creation

- `NewConversationDialog` now has two tabs: "Direct message" (existing
  click-to-start flow) and "Group chat" (name input + checkbox multi-select
  over the directory, `POST /api/conversations` with `type: 'group'`)
- No backend changes needed — `createConversation` already supported
  `group`/`channel` types and multiple `memberIds`
- Verified via curl: creating a group with multiple members returns the
  conversation with all members and `getConversationTitle` shows the group
  name in the sidebar

### Status
✅ Group chat creation working (frontend type-checks cleanly, backend verified
   via curl; manual browser test pending).

---

## Next Up — Phase 3 (remaining)

- [ ] Image/video thumbnails, media gallery per chat
- [ ] Link previews (OG metadata)
- [ ] Signal Protocol key registration + real E2E encryption
