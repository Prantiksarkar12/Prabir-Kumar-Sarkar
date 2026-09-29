# Real-Time WebSocket Architecture

Pulse uses Socket.IO mounted alongside the Express HTTP server on port 3000.

## Handshake Authentication
Every WebSocket connection undergoes mandatory session token verification:
```typescript
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  // Look up token in PostgreSQL sessions table
  // Verify token expiry and check if user is suspended
});
```

## Rooms Architecture
- `user:${userId}`: User-specific unicast channel for direct alerts and invites.
- `conversation:${conversationId}`: Multicast channel for conversation messages, reactions, edits, and typing indicators.

## Events Catalog

| Event Name | Direction | Payload | Description |
|------------|-----------|---------|-------------|
| `message:new` | Server -> Room | `{ conversationId, message }` | New broadcast message |
| `message:updated` | Server -> Room | `{ conversationId, message }` | Edited message or pinned state |
| `message:deleted` | Server -> Room | `{ conversationId, messageId, deletedBy }` | Soft deletion event |
| `message:reaction_added` | Server -> Room | `{ conversationId, messageId, reaction, userId }` | Emoji reaction added |
| `message:reaction_removed`| Server -> Room | `{ conversationId, messageId, reaction, userId }` | Emoji reaction removed |
| `message:read` | Server -> Room | `{ conversationId, messageId, userId, readAt }` | Read receipt update |
| `user:online` | Server -> All | `{ userId, username, status }` | User connected |
| `user:offline` | Server -> All | `{ userId, username, lastSeen }` | User disconnected |
| `user:presence_sync` | Server -> Client | `{ onlineUserIds: string[] }` | Initial active user list |
| `user:typing_start` | Bidirectional | `{ conversationId, userId, username }` | Typing indicator started |
| `user:typing_stop` | Bidirectional | `{ conversationId, userId }` | Typing indicator stopped |
| `conversation:created` | Server -> User | `{ conversationId }` | New group or 1-on-1 thread |
| `conversation:updated` | Server -> Room | `Conversation` | Title, description, or avatar update |
| `conversation:member_added` | Server -> Room | `{ conversationId, member }` | Member joined group |
| `conversation:member_removed` | Server -> Room | `{ conversationId, userId }` | Member left or was removed |
| `notification:new` | Server -> User | `{ id, type, title, body, data }` | In-app notification |
