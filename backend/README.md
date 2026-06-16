# Messenger Backend

Express + TypeScript API with PostgreSQL, Redis, JWT auth, admin-only user
provisioning (closed registration), conversations/messages, and a Socket.IO
real-time engine (Phases 1-2).

## Setup

```bash
cp .env.example .env
npm install
docker compose up -d        # starts Postgres + Redis, applies db/init.sql
npm run seed                 # creates the first admin user
npm run dev                   # starts the API on http://localhost:4000
```

Default seeded admin: `admin@company.local` / `ChangeMe123!` (override via
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` env vars).

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | Health check |
| POST | `/api/auth/login` | none | Login with email + password, returns JWT |
| GET | `/api/auth/me` | Bearer token | Get current user profile |
| GET | `/api/users/me` | Bearer token | Get own profile (id, displayName, avatarUrl, department, role) |
| PATCH | `/api/users/me` | Bearer token | Update own `displayName` and/or `department` |
| POST | `/api/users/me/avatar` | Bearer token | Upload avatar image (multipart `avatar` field, max 5 MB); resized to 256×256 webp |
| GET | `/api/users/:userId/avatar` | Bearer token | Fetch any user's avatar (webp, 404 if none set) |
| GET | `/api/users` | Bearer token (admin) | List all users |
| POST | `/api/users` | Bearer token (admin) | Create a new user (closed registration) |
| POST | `/api/conversations` | Bearer token | Create a direct/group/channel conversation |
| GET | `/api/conversations` | Bearer token | List conversations for the current user |
| GET | `/api/conversations/:id` | Bearer token | Get a conversation + members |
| GET | `/api/conversations/:id/media` | Bearer token | List image/video messages (with file metadata) for the media gallery |
| POST | `/api/conversations/:id/members` | Bearer token | Add a member (owner/admin only) |
| DELETE | `/api/conversations/:id/members/:userId` | Bearer token | Remove a member / leave |
| POST | `/api/messages` | Bearer token | Send a message (fans out to recipient devices) |
| GET | `/api/messages?conversationId=&before=&limit=` | Bearer token | Paginated message history |
| POST | `/api/messages/:id/read` | Bearer token | Mark a message read for the current device |
| PATCH | `/api/messages/:id` | Bearer token | Edit own message (`{ ciphertext }`); fails if deleted |
| DELETE | `/api/messages/:id` | Bearer token | Soft-delete own message (clears ciphertext, shows as "deleted" to all members) |
| POST | `/api/files` | Bearer token | Upload a file (multipart `file` field), returns file metadata |
| GET | `/api/files/:id` | Bearer token | Download/stream a file (requires conversation membership once attached) |
| GET | `/api/files/:id/thumbnail` | Bearer token | Download a generated thumbnail (images only; 404 if none) |

### Socket.IO events

Connect to the same origin with `auth: { token: <JWT> }`. The socket auto-joins
a room per conversation the user belongs to.

| Event (client -> server) | Payload | Notes |
|---|---|---|
| `typing:start` / `typing:stop` | `{ conversationId }` | Broadcast to other members |
| `message:send` | `{ conversationId, type?, ciphertext?, replyToMessageId?, fileId? }` | Ack via callback, broadcasts `message:new` |
| `message:read` | `{ messageId }` | Ack via callback, broadcasts `message:read` |
| `message:edit` | `{ messageId, ciphertext }` | Ack via callback, broadcasts `message:edited` |
| `message:delete` | `{ messageId }` | Ack via callback, broadcasts `message:deleted` |

| Event (server -> client) | Payload |
|---|---|
| `message:new` | the created message |
| `message:read` | `{ messageId, userId, deviceId }` |
| `message:edited` | `{ id, conversationId, ciphertext, editedAt }` |
| `message:deleted` | `{ id, conversationId, deletedAt }` |
| `typing:start` / `typing:stop` | `{ conversationId, userId }` |
| `presence:update` | `{ userId, status: 'online' \| 'offline' }` |

## Structure

```
src/
  config/        env, Postgres pool, Redis client
  middleware/     auth (JWT), error handling
  modules/
    auth/         login, current user, device provisioning
    users/        admin user management
    conversations/ create/list/get conversations, manage members
    messages/      send, history, read receipts (delivery fan-out)
    files/         file upload (multer, local disk) + authenticated download,
                   image thumbnails (sharp)
  realtime/        Socket.IO setup, presence, typing, message events
  scripts/        seed-admin
  app.ts          Express app + route wiring
  server.ts       entry point (HTTP server + Socket.IO)
db/init.sql       schema (see ../docs/database-design.md)
```

## Not yet implemented (future phases)

- LDAP/SSO integration (currently local email+password accounts)
- 2FA (TOTP)
- Signal Protocol key registration + real E2E encryption (ciphertext fields
  currently store opaque bytes provided by the client, duplicated per
  recipient device)
- Object storage backend for files (currently local disk under `UPLOADS_DIR`,
  see `docker-compose`/PLAN.md for the planned MinIO swap)
- Link previews
- Server-side video thumbnails (requires ffmpeg; videos currently use the
  browser's decoded first frame as a client-side preview)
