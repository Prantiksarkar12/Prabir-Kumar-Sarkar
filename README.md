# Pulse — Real-Time Enterprise Chat Platform

Pulse is an original, production-grade real-time messaging platform built from zero. It features PostgreSQL ACID persistence, WebSocket event streaming, in-browser voice note recording with waveform visualizers, role-based access control (RBAC), user moderation, and administrative oversight.

---

## Key Features

- **Real PostgreSQL Storage**: Powered by PostgreSQL tables with foreign keys, composite indexes, cascading deletions, and transactional writes.
- **WebSocket Streaming**: Instant delivery via Socket.IO, with presence awareness (`ONLINE`, `OFFLINE`, `last_seen_at`), typing indicators, and delivery receipts (`SENT` → `DELIVERED` → `READ`).
- **Rich Media & Voice Notes**: In-browser audio recording using the HTML5 `MediaRecorder` API with live waveform animation, audio player playback, image uploads, and document sharing.
- **Direct & Group Chats**: 1-on-1 private messaging and group chats with customizable roles (`OWNER`, `ADMIN`, `MEMBER`), avatar management, member invitations, and removal.
- **Reactions & Threads**: Full emoji reaction support with counts and user lists, reply quoting, inline message editing, and pinning.
- **Moderation & Administrative Oversight**:
  - Live statistics dashboard (total users, message counts, active sockets, open reports).
  - Moderation queue for handling reported messages, users, and groups.
  - User suspension / ban controls with immediate session invalidation.
  - Immutable audit logging for privileged actions.
- **Privacy & Security**:
  - Salting and hashing via bcrypt/argon2.
  - Granular privacy settings (who can message, see online status, last seen, read receipts).
  - Full block engine preventing messaging and discovery.
  - Active multi-device session management with instant revocation.
  - Clean account deletion flow.

---

## Architecture Overview

```text
chat-platform/
├── server/
│   ├── db.ts                   # PostgreSQL initialization & schema migrations
│   ├── socket.ts               # Socket.IO gateway & presence manager
│   ├── middleware/auth.ts      # Authentication guard & RBAC enforcement
│   └── routes/
│       ├── auth.ts             # Registration, login, sessions, password
│       ├── users.ts            # Profile, privacy settings, blocking
│       ├── conversations.ts    # Direct & group chats, member management
│       ├── messages.ts         # Messages, replies, edits, reactions, pins
│       ├── uploads.ts          # Media & voice note storage
│       ├── reports.ts          # Moderation reporting
│       ├── admin.ts            # Admin dashboard, audit logs, ban controls
│       └── health.ts           # Service & DB health checks
├── src/
│   ├── components/             # React chat, moderation, settings components
│   ├── lib/                    # Typed API client & Socket.IO service
│   ├── types/                  # Shared TypeScript interfaces
│   └── App.tsx                 # Full workspace layout
├── prisma/
│   └── schema.prisma           # Production PostgreSQL Prisma schema
├── infrastructure/
│   ├── docker/                 # Container runtime configs
│   └── nginx/                  # NGINX reverse proxy & rate limiting
├── docs/                       # Complete architectural specifications
├── docker-compose.yml          # Local multi-service cluster
└── server.ts                   # Full-stack server entry point
```

---

## Getting Started

### 1. Installation
```bash
npm install
```

### 2. Development Run
Start the combined Express + Socket.IO server with Vite middlewares on port 3000:
```bash
npm run dev
```

### 3. Production Build
```bash
npm run build
npm run start
```

### 4. Docker Deployment
```bash
docker compose up -d --build
```

---

## Server / Environment Value List

For **local hosting**, enter these values:

| Name                   | Value                                                          |
| ---------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`         | `postgresql://chatapp:YOUR_DB_PASSWORD@localhost:5432/chatapp` |
| `REDIS_URL`            | `redis://localhost:6379`                                       |
| `SESSION_SECRET`       | Generate a long random secret                                  |
| `S3_ENDPOINT`          | `http://localhost:9000`                                        |
| `S3_REGION`            | `us-east-1`                                                    |
| `S3_BUCKET`            | `chatapp`                                                      |
| `S3_ACCESS_KEY`        | Your MinIO access key                                          |
| `S3_SECRET_KEY`        | Your MinIO secret key                                          |
| `VITE_API_URL`         | `http://localhost:4000/api/v1`                                 |
| `VITE_SOCKET_URL`      | `http://localhost:4000`                                        |
| `SMTP_HOST`            | Your SMTP server, or leave empty                               |
| `SMTP_PORT`            | `587`                                                          |
| `SMTP_USER`            | Your SMTP username                                             |
| `SMTP_PASSWORD`        | Your SMTP password                                             |
| `WEB_PUSH_PUBLIC_KEY`  | Your VAPID public key                                          |
| `WEB_PUSH_PRIVATE_KEY` | Your VAPID private key                                         |

### Required local services

```text
Frontend       → localhost:3000
Backend/API    → localhost:4000
PostgreSQL     → localhost:5432
Redis          → localhost:6379
MinIO          → localhost:9000
MinIO Console  → localhost:9001
```

### Production values

Replace localhost with your real infrastructure:

```text
DATABASE_URL   → PostgreSQL server
REDIS_URL      → Redis server
S3_ENDPOINT    → https://storage.yourdomain.com
VITE_API_URL   → https://api.yourdomain.com/api/v1
VITE_SOCKET_URL → https://api.yourdomain.com
```

**Do not invent the database password, S3 keys, SMTP credentials, or VAPID keys.** Those must be generated/configured on the actual servers.

For the **unlimited-connections requirement**, there is no `UNLIMITED_CONNECTIONS=true` value. The backend should have **no artificial application connection cap**; actual capacity is determined by the server infrastructure.

---

## Health Checks
- `GET /api/v1/health` or `GET /api/health`: Application status & uptime
- `GET /api/v1/health/database` or `GET /api/health/database`: Active PostgreSQL latency ping & table verification
- `GET /api/v1/health/redis` or `GET /api/health/redis`: Real-time gateway coordination status

---

## License
MIT License.
