Core features to build
Direct messages (1-on-1), group chats, channels (read-only broadcasts), file sharing, voice/video calls, message delivery status (sent/delivered/read), and online presence indicators.
Recommended tech stack
For a secure internal app, a solid modern stack would be:

Backend: Node.js (Express or Fastify) or Go — both handle WebSocket connections well
Real-time messaging: WebSockets via Socket.IO or a self-hosted MQTT broker
Database: PostgreSQL for users/metadata + Redis for presence/session caching
File storage: MinIO (self-hosted S3-compatible) so files stay on your infrastructure
End-to-end encryption: Signal Protocol (libsignal) — the same protocol WhatsApp uses
Frontend: React Native (iOS + Android from one codebase) + React for web/desktop

Security advantages over Telegram
Since this is your motivation — you get full control over encryption keys, data residency (servers stay inside your network or private cloud), no third-party data access, SSO/LDAP integration with your existing employee directory, and full audit logs for compliance.
Phases to plan

Authentication (SSO/LDAP + 2FA)
Core messaging (DMs + groups)
File sharing + media
Voice/video calls (WebRTC)
Admin dashboard + user management
Mobile apps