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

- [x] Image/video thumbnails, media gallery per chat
- [ ] Link previews (OG metadata)
- [ ] Signal Protocol key registration + real E2E encryption

---

## 2026-06-14 — Git repo + push to GitHub

- Added a root `.gitignore` (node_modules, dist, `.env`/`.env.*` except
  `.env.example`, `backend/uploads/`, logs, editor files) and closed a gap in
  `frontend/.gitignore` (it covered `*.local` but not `.env` directly)
- Initialized the git repo at the project root, committed everything except
  the gitignored secrets/build output/uploads, and pushed to
  `https://github.com/hairicle-tech1/message-app.git` (`main` branch)
- Verified `git status` showed no `.env` files or `backend/uploads/*` staged
  before committing

### Status
✅ Project pushed to GitHub with `.env` files and uploaded user content
   excluded.

---

## 2026-06-14 — Documentation: README overhaul

- Rewrote the root [README.md](README.md): project overview, phase status
  table, tech stack, project structure, quick start (`run.ps1` + manual
  setup), default seeded credentials, and security notes (gitignored
  `.env`/`uploads/`, closed registration)
- Rewrote [frontend/README.md](frontend/README.md), replacing the generic Vite
  template with project-specific setup, scripts, and folder structure
- `backend/README.md` was already up to date and left unchanged

### Status
✅ Root and frontend READMEs now reflect the actual project.

---

## 2026-06-15 — Phase 3: Image/video thumbnails & media gallery

- Added `sharp` to the backend and a `has_thumbnail` column on `files`
  (migration applied to the running DB + added to `db/init.sql`)
- **Backend**: image uploads now generate a 320px webp thumbnail under
  `uploads/thumbnails/`; `GET /api/files/:id/thumbnail` streams it
  (404 if none, e.g. for non-images). `FileMeta` (returned from upload,
  message send, and message history) now includes `hasThumbnail`
- New `GET /api/conversations/:id/media` returns all `image`/`video`
  messages + file metadata for a conversation, for the gallery view
- **Frontend**: `useFileBlobUrl` now supports a `thumbnail` variant
  (separate cache key) so inline image attachments load the small webp
  instead of the full file; `MessageAttachment` renders images/videos as
  clickable previews (video uses `preload="metadata"` for a free
  first-frame thumbnail) that open a new `Lightbox` component (full-size
  image or video with controls)
- New `MediaGallery` component: a "Media" button in the thread header opens
  a grid of all image/video attachments for the conversation, each opening
  the same `Lightbox` on click
- Video thumbnails are client-side only (browser-decoded first frame); true
  server-side video frame extraction would need ffmpeg and is left for later
- Verified end-to-end via curl: uploaded image got `hasThumbnail: true`,
  `/api/files/:id/thumbnail` returned a valid 1x1 webp, and
  `/api/conversations/:id/media` listed it; both apps type-check cleanly

### Status
✅ Image thumbnails + media gallery working end-to-end (backend verified via
   curl; frontend type-checks cleanly, manual browser test pending).
