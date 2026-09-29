import { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { db } from './db';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  userRole?: string;
}

// Map of userId -> Set of active socket IDs
const userSockets = new Map<string, Set<string>>();
// Map of conversationId -> Map of userId -> typing timer
const typingTimers = new Map<string, Map<string, NodeJS.Timeout>>();

let ioInstance: Server | null = null;

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized yet');
  }
  return ioInstance;
}

export function isUserOnline(userId: string): boolean {
  const sockets = userSockets.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

export function getOnlineUsers(): string[] {
  return Array.from(userSockets.keys()).filter((uid) => {
    const s = userSockets.get(uid);
    return s && s.size > 0;
  });
}

export function initSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  ioInstance = io;

  // Socket Authentication Middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers['x-session-token'];
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Check session in PostgreSQL
      const sessionRes = await db.query(
        `SELECT s.user_id, s.expires_at, u.username, u.role, u.is_banned, u.ban_reason
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = $1`,
        [token]
      );

      if (sessionRes.rows.length === 0) {
        return next(new Error('Invalid or expired session'));
      }

      const session = sessionRes.rows[0] as any;
      if (new Date(session.expires_at) < new Date()) {
        return next(new Error('Session expired'));
      }

      if (session.is_banned) {
        return next(new Error(`Account suspended: ${session.ban_reason || 'Violation of terms'}`));
      }

      socket.userId = session.user_id;
      socket.username = session.username;
      socket.userRole = session.role;

      // Update session last active
      await db.query(
        `UPDATE sessions SET last_active_at = NOW() WHERE token = $1`,
        [token]
      );

      return next();
    } catch (err) {
      console.error('[Socket Auth] Error verifying token:', err);
      return next(new Error('Internal authentication error'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId;
    const username = socket.username;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    console.log(`[Socket] User connected: ${username} (${userId}) [socket: ${socket.id}]`);

    // Track active socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    const currentSockets = userSockets.get(userId)!;
    const isFirstConnection = currentSockets.size === 0;
    currentSockets.add(socket.id);

    // Join personal user room for direct events
    socket.join(`user:${userId}`);

    // Join all conversations the user is a member of
    try {
      const convRes = await db.query(
        `SELECT conversation_id FROM conversation_members WHERE user_id = $1`,
        [userId]
      );
      for (const row of convRes.rows as any[]) {
        socket.join(`conversation:${row.conversation_id}`);
      }
    } catch (err) {
      console.error('[Socket] Failed to join conversation rooms:', err);
    }

    // If first socket connection, broadcast user:online to all conversation rooms and relevant users
    if (isFirstConnection) {
      try {
        // Find all conversation IDs the user belongs to
        const convRes = await db.query(
          `SELECT conversation_id FROM conversation_members WHERE user_id = $1`,
          [userId]
        );
        for (const row of convRes.rows as any[]) {
          io.to(`conversation:${row.conversation_id}`).emit('user:online', {
            userId,
            username,
            status: 'ONLINE',
          });
        }

        // Also broadcast directly to shared conversation members
        const relatedRes = await db.query(
          `SELECT DISTINCT cm2.user_id
           FROM conversation_members cm1
           JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
           WHERE cm1.user_id = $1 AND cm2.user_id != $1`,
          [userId]
        );
        for (const r of relatedRes.rows as any[]) {
          io.to(`user:${r.user_id}`).emit('user:online', {
            userId,
            username,
            status: 'ONLINE',
          });
        }
      } catch (err) {
        console.error('[Socket] Presence online broadcast error:', err);
      }
    }

    // Send the current list of online users to the freshly connected socket
    socket.emit('user:presence_sync', {
      onlineUserIds: getOnlineUsers(),
    });

    // Handle joining a newly created conversation
    socket.on('conversation:join', (data: { conversationId: string }) => {
      if (data?.conversationId) {
        socket.join(`conversation:${data.conversationId}`);
      }
    });

    // Handle leaving a conversation room
    socket.on('conversation:leave', (data: { conversationId: string }) => {
      if (data?.conversationId) {
        socket.leave(`conversation:${data.conversationId}`);
      }
    });

    // Typing start
    socket.on('user:typing_start', ({ conversationId }: { conversationId: string }) => {
      if (!conversationId) return;

      socket.to(`conversation:${conversationId}`).emit('user:typing_start', {
        conversationId,
        userId,
        username,
      });

      // Manage auto-timeout for typing indicator
      if (!typingTimers.has(conversationId)) {
        typingTimers.set(conversationId, new Map());
      }
      const convTimers = typingTimers.get(conversationId)!;
      if (convTimers.has(userId)) {
        clearTimeout(convTimers.get(userId)!);
      }

      convTimers.set(
        userId,
        setTimeout(() => {
          io.to(`conversation:${conversationId}`).emit('user:typing_stop', {
            conversationId,
            userId,
          });
          convTimers.delete(userId);
        }, 4000)
      );
    });

    // Typing stop
    socket.on('user:typing_stop', ({ conversationId }: { conversationId: string }) => {
      if (!conversationId) return;

      const convTimers = typingTimers.get(conversationId);
      if (convTimers && convTimers.has(userId)) {
        clearTimeout(convTimers.get(userId)!);
        convTimers.delete(userId);
      }

      socket.to(`conversation:${conversationId}`).emit('user:typing_stop', {
        conversationId,
        userId,
      });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`[Socket] User socket disconnected: ${username} [socket: ${socket.id}]`);
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          const nowIso = new Date().toISOString();

          // Durable last_seen_at update in PostgreSQL
          try {
            await db.query(`UPDATE users SET last_seen_at = NOW() WHERE id = $1`, [userId]);
          } catch (e) {
            console.error('[Socket] Failed to update last_seen_at:', e);
          }

          // Broadcast offline event to relevant conversation rooms and users
          try {
            const convRes = await db.query(
              `SELECT conversation_id FROM conversation_members WHERE user_id = $1`,
              [userId]
            );
            for (const row of convRes.rows as any[]) {
              io.to(`conversation:${row.conversation_id}`).emit('user:offline', {
                userId,
                username,
                lastSeen: nowIso,
              });
            }

            const relatedRes = await db.query(
              `SELECT DISTINCT cm2.user_id
               FROM conversation_members cm1
               JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
               WHERE cm1.user_id = $1 AND cm2.user_id != $1`,
              [userId]
            );
            for (const r of relatedRes.rows as any[]) {
              io.to(`user:${r.user_id}`).emit('user:offline', {
                userId,
                username,
                lastSeen: nowIso,
              });
            }
          } catch (e) {
            console.error('[Socket] Offline broadcast error:', e);
          }
        }
      }
    });
  });

  return io;
}

// Helpers for Server routes to broadcast events

export function emitToConversation(conversationId: string, event: string, payload: any) {
  if (ioInstance) {
    ioInstance.to(`conversation:${conversationId}`).emit(event, payload);
  }
}

export function emitToUser(userId: string, event: string, payload: any) {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, payload);
  }
}

export function emitToAll(event: string, payload: any) {
  if (ioInstance) {
    ioInstance.emit(event, payload);
  }
}

export function joinUserToConversation(userId: string, conversationId: string) {
  if (!ioInstance) return;
  const sockets = userSockets.get(userId);
  if (sockets) {
    for (const socketId of sockets) {
      const socket = ioInstance.sockets.sockets.get(socketId);
      if (socket) {
        socket.join(`conversation:${conversationId}`);
      }
    }
  }
}
