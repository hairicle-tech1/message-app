# Project Plan — Internal Messenger App

## Overview

A secure, self-hosted internal communications platform (Telegram/Slack-style) giving the
organization full control over encryption keys, data residency, and compliance — with
no third-party data access.

## Core Features

- Direct messages (1-on-1)
- Group chats
- Channels (read-only broadcasts)
- File & media sharing
- Message delivery status (sent / delivered / read)
- Online presence indicators
- Voice / video calls *(future / optional — see Future Enhancements)*

## Tech Stack

| Area | Choice |
|---|---|
| Backend | Node.js (Express/Fastify) |
| Real-time | WebSockets (Socket.IO) / self-hosted MQTT |
| Database | PostgreSQL (users/metadata) + Redis (presence/sessions) |
| File storage | MinIO (self-hosted S3-compatible) |
| Encryption | Signal Protocol (libsignal) for E2E |
| Frontend | React (web/desktop) + React Native (iOS/Android) |

## Security Advantages over Telegram

- **Default end-to-end encryption** — Telegram only encrypts normal chats in transit/at rest on its own servers (it holds the keys); only opt-in "Secret Chats" are true E2E. Our app uses libsignal E2E for every chat by default, so not even server admins can read message content.
- **Full control over encryption keys** — Keys are generated and held on user devices, never on our servers.
- **Data residency within internal network / private cloud** — All messages, files, and metadata stay on infrastructure the company owns, instead of Telegram's data centers in undisclosed locations.
- **No third-party data access** — Removes Telegram (a company we don't control) from the equation entirely — no risk of breach, subpoena, policy change, or metadata exposure via a third party.
- **SSO/LDAP integration with existing employee directory** — Login ties directly into company AD/LDAP, so access follows the employee's account status automatically.
- **Closed registration** — Accounts are provisioned via company LDAP/admin only, with no public sign-up. This removes the open-registration attack surface (bots, fake accounts, account-takeover via sign-up flows) and ensures offboarded employees lose access immediately when their LDAP account is disabled.
- **Full audit logs for compliance** — Tracks logins, channel access, and file uploads/downloads — visibility Telegram doesn't provide, needed for SOC2/HIPAA/financial-style compliance requirements.

---

## Build Phases & Timeline (10 weeks)

### Phase 1 — Foundation & Authentication (Weeks 1–2)

- **Backend scaffold**: Node.js + Express, PostgreSQL, Redis, project structure
- **Auth system**: SSO/LDAP integration, JWT tokens, 2FA via TOTP
- **Closed registration**: No public sign-up endpoint — accounts created via LDAP sync or admin panel only
- **User management**: Profiles, roles, departments, employee directory
- **E2E encryption**: Signal Protocol (libsignal) key setup and distribution

**Stack:** Node.js, PostgreSQL, Redis, libsignal, LDAP

### Phase 2 — Core Messaging (Weeks 3–5)

- **Direct messages**: 1-on-1 encrypted chat, read receipts, delivery status
- **Group chats**: Create groups, add/remove members, group admin roles
- **Real-time engine**: WebSocket via Socket.IO, presence, typing indicators
- **Channels**: Broadcast-only channels, subscriptions, announcements

**Stack:** Socket.IO, React, WebSockets, IndexedDB

### Phase 3 — File Sharing & Media (Weeks 6–7)

- **File uploads**: Encrypted storage on MinIO, chunked upload, progress
- **Image & video**: Thumbnails, inline preview, media gallery per chat
- **Voice notes**: Record, send, and play back audio messages in-app
- **Link previews**: OG metadata fetching, safe preview rendering

**Stack:** MinIO, FFmpeg, Sharp, Web Audio API

### Phase 4 — Mobile Apps (Weeks 8–9)

- **React Native app**: Shared codebase for iOS and Android from one repo
- **Push notifications**: Self-hosted via FCM/APNs, encrypted payload
- **Offline mode**: Message queue, local cache, sync on reconnect
- **Mobile UX**: Swipe gestures, haptic feedback, biometric lock

**Stack:** React Native, Expo, FCM, APNs, SQLite

### Phase 5 — Admin, Compliance & Launch (Week 10)

- **Admin dashboard**: User management, group controls, usage analytics
- **Audit logs**: Message metadata logs, access records, compliance export
- **Monitoring**: Prometheus + Grafana, uptime alerts, error tracking
- **Deploy & rollout**: Docker / K8s, pilot team, full org onboarding

**Stack:** Docker, Kubernetes, Prometheus, Grafana, Sentry

---

## Future Enhancements (Post-Launch)

### Voice & Video Calls

- **1-on-1 calls**: WebRTC peer-to-peer voice and video, DTLS encryption
- **Group calls**: SFU server (mediasoup), up to 25 participants
- **Screen share**: Desktop capture, presenter controls, annotations
- **TURN/STUN**: Self-hosted Coturn server for NAT traversal

**Stack:** WebRTC, mediasoup, Coturn, DTLS-SRTP

---

## Next Steps

- [x] Confirm backend language choice — Node.js
- [ ] Set up repo structure and CI/CD
- [ ] Begin Phase 1: backend scaffold + auth system
