# REST API Reference

Pulse provides structured REST endpoints with JSON payloads, status codes, and authorization guards.

## Authentication
- `POST /api/auth/register`: Create a new user account
- `POST /api/auth/login`: Authenticate with username/email and password
- `POST /api/auth/logout`: Invalidate current session
- `GET /api/auth/session`: Retrieve authenticated user identity and settings
- `POST /api/auth/password/change`: Update password and revoke other sessions
- `POST /api/auth/delete-account`: Permanently delete account and all data

## Users & Profiles
- `GET /api/users/me`: Current user profile
- `PATCH /api/users/me`: Update display name, bio, or avatar
- `GET /api/users/search?q={query}`: Search registered users
- `GET /api/users/:id`: Get user profile with live presence check
- `GET /api/users/me/privacy`: Get privacy preferences
- `PATCH /api/users/me/privacy`: Update privacy settings
- `POST /api/users/:id/block`: Block a user
- `DELETE /api/users/:id/block`: Unblock a user
- `GET /api/users/me/blocks`: List blocked users
- `GET /api/users/me/sessions`: List active device sessions
- `DELETE /api/users/me/sessions/:id`: Revoke a session

## Conversations
- `GET /api/conversations`: List conversations with unread counts and last message
- `POST /api/conversations/direct`: Start or get direct message thread
- `POST /api/conversations/group`: Create a group chat
- `GET /api/conversations/:id`: Retrieve single conversation details and members
- `PATCH /api/conversations/:id`: Update group metadata (title, description, avatar)
- `POST /api/conversations/:id/members`: Add a member to the group
- `DELETE /api/conversations/:id/members/:userId`: Remove member or leave group
- `PATCH /api/conversations/:id/settings`: Update personal pin/mute/archive settings

## Messages
- `GET /api/conversations/:id/messages?cursor={cursor}&limit={limit}&q={search}`: Cursor-paginated message history
- `POST /api/conversations/:id/messages`: Send text, media, or voice note
- `PATCH /api/messages/:id`: Edit message content
- `DELETE /api/messages/:id`: Soft-delete message
- `POST /api/messages/:id/reactions`: Toggle emoji reaction
- `POST /api/conversations/:id/read`: Mark conversation messages as read
- `POST /api/messages/:id/pin`: Toggle message pin state

## Media & Storage
- `POST /api/uploads`: Secure file & voice note upload

## Reports & Moderation
- `POST /api/reports`: Submit a moderation report
- `GET /api/reports?status={status}`: List reports (Moderators & Admins)
- `PATCH /api/reports/:id`: Resolve or dismiss report

## Admin
- `GET /api/admin/stats`: Real PostgreSQL platform counts
- `GET /api/admin/users`: User management list
- `PATCH /api/admin/users/:id/role`: Change platform role
- `POST /api/admin/users/:id/ban`: Suspend user
- `POST /api/admin/users/:id/unban`: Unban user
- `GET /api/admin/audit-logs`: Audit logs stream
- `GET /api/admin/conversations`: Group review list

## Health Checks
- `GET /api/health`: Application status
- `GET /api/health/database`: PostgreSQL latency ping
- `GET /api/health/redis`: Real-time gateway coordination status
