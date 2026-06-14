# Messenger App

A secure, self-hosted internal communications platform (Telegram/Slack-style)
giving the organization full control over encryption keys, data residency,
and compliance — with no third-party data access.

See [PLAN.md](PLAN.md) for the full project plan and [PROGRESS.md](PROGRESS.md)
for a session-by-session build log.

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Foundation & auth (JWT, closed registration, user directory) | ✅ |
| 2 | Core messaging (DMs, group chats, real-time via Socket.IO, presence, typing, read receipts) | ✅ |
| 3 | File sharing, voice notes, image/video thumbnails & media gallery | ✅ |
| 3 (remaining) | Link previews, Signal Protocol E2E | ⏳ |
| 4 | Mobile apps (React Native) | ⏳ |
| 5 | Admin dashboard, audit logs, monitoring | ⏳ |

## Tech stack

- **Backend**: Node.js + Express (TypeScript, ESM), PostgreSQL, Redis, JWT auth, Socket.IO
- **Frontend**: React + TypeScript + Vite
- **Storage**: Local filesystem for uploaded files/voice notes (abstracted behind a `files` table for an easy MinIO/S3 swap later)
- **Infra**: Docker Compose (Postgres + Redis)

## Project structure

```
backend/    Express API, Socket.IO real-time engine, Postgres/Redis (see backend/README.md)
frontend/   React + Vite web client (see frontend/README.md)
docs/       Database design (ERD + DDL) and product mockups
PLAN.md     Full project plan, phases, and security rationale
PROGRESS.md Session-by-session build log
run.ps1     Launches Docker, backend, and frontend dev servers
```

## Getting started

### Quick start (Windows / PowerShell)

```powershell
./run.ps1
```

This starts the Postgres + Redis containers, then opens the backend
(`http://localhost:4000`) and frontend (`http://localhost:5173`) dev servers
each in their own PowerShell window.

### Manual setup

```bash
# Backend
cd backend
cp .env.example .env
npm install
docker compose up -d   # Postgres + Redis
npm run seed            # creates the first admin user
npm run dev              # http://localhost:4000

# Frontend (in a separate terminal)
cd frontend
cp .env.example .env
npm install
npm run dev              # http://localhost:5173
```

Default seeded admin: `admin@company.local` / `ChangeMe123!` (override via
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`). Run
`npm run seed:users` for a handful of additional sample employee accounts.

See [backend/README.md](backend/README.md) for the full API/Socket.IO
reference and [frontend/README.md](frontend/README.md) for frontend details.

## Security notes

- `.env` files are gitignored — never commit real secrets (`JWT_SECRET`,
  database credentials, etc.). Copy `.env.example` and fill in your own values.
- `backend/uploads/` (user-uploaded files and voice notes) is gitignored.
- Registration is closed: accounts are provisioned by an admin only.
