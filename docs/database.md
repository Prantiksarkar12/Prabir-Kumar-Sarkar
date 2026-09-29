# Database Specification

Pulse relies exclusively on PostgreSQL for persistent application data.

## Relational Schema

### 1. `users`
- `id` (TEXT, PK): Unique prefixed identifier (`usr_...`)
- `username` (TEXT, UNIQUE): Lowercase alphanumeric handle
- `display_name` (TEXT): Visual profile name
- `email` (TEXT, UNIQUE): Verified contact address
- `password_hash` (TEXT): Salted bcrypt / argon2 hash
- `avatar_url` (TEXT): Object storage / avatar service URL
- `bio` (TEXT): User description
- `role` (TEXT): `USER` | `MODERATOR` | `ADMIN` | `SUPER_ADMIN`
- `is_banned` (BOOLEAN): Suspension flag
- `ban_reason` (TEXT): Moderator rationale
- `last_seen_at` (TIMESTAMP WITH TIME ZONE): Durable presence record
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE)

### 2. `sessions`
- `id` (TEXT, PK): Session ID
- `user_id` (TEXT, FK -> users.id ON DELETE CASCADE)
- `token` (TEXT, UNIQUE): Cryptographically secure random bearer token
- `device_info` (TEXT): User-Agent hardware/client metadata
- `ip_address` (TEXT): Client origin IP
- `expires_at` (TIMESTAMP WITH TIME ZONE): Expiration boundary
- `created_at`, `last_active_at` (TIMESTAMP WITH TIME ZONE)

### 3. `conversations`
- `id` (TEXT, PK): Conversation ID (`cnv_...` or `grp_...`)
- `type` (TEXT): `DIRECT` | `GROUP`
- `title` (TEXT): Group name
- `description` (TEXT): Group description
- `avatar_url` (TEXT): Group image
- `created_by` (TEXT, FK -> users.id)
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE)

### 4. `conversation_members`
- `id` (TEXT, PK)
- `conversation_id` (TEXT, FK -> conversations.id ON DELETE CASCADE)
- `user_id` (TEXT, FK -> users.id ON DELETE CASCADE)
- `role` (TEXT): `OWNER` | `ADMIN` | `MEMBER`
- `is_muted` (BOOLEAN)
- `is_pinned` (BOOLEAN)
- `is_archived` (BOOLEAN)
- `last_read_message_id` (TEXT)
- `last_read_at` (TIMESTAMP WITH TIME ZONE)
- `joined_at` (TIMESTAMP WITH TIME ZONE)
- `UNIQUE(conversation_id, user_id)`

### 5. `messages`
- `id` (TEXT, PK): `msg_...`
- `conversation_id` (TEXT, FK -> conversations.id ON DELETE CASCADE)
- `sender_id` (TEXT, FK -> users.id ON DELETE CASCADE)
- `content` (TEXT)
- `message_type` (TEXT): `TEXT` | `IMAGE` | `FILE` | `AUDIO` | `VOICE` | `SYSTEM`
- `reply_to_message_id` (TEXT, FK -> messages.id ON DELETE SET NULL)
- `client_message_id` (TEXT): Client idempotency key
- `is_pinned` (BOOLEAN)
- `created_at`, `updated_at`, `edited_at`, `deleted_at`, `deleted_by`

### 6. Supporting Tables
- `message_reactions`: Unique per (message_id, user_id, reaction)
- `message_attachments`: File URL, MIME type, size, duration
- `message_reads`: Timestamped read events
- `blocks`: Prevents 1-on-1 chats and mutual visibility
- `reports`: Moderation cases with status `OPEN` | `UNDER_REVIEW` | `RESOLVED` | `DISMISSED`
- `audit_logs`: Immutable tracking of security and administrative operations
