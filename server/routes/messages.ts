import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, logAuditEvent } from '../middleware/auth';
import {
  emitToConversation,
  emitToUser,
  isUserOnline
} from '../socket';

export const messagesRouter = Router();

// Helper to populate complete message object
async function populateMessage(messageId: string, currentUserId?: string) {
  const msgRes = await db.query(
    `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
            m.reply_to_message_id, m.client_message_id, m.is_pinned,
            m.created_at, m.updated_at, m.edited_at, m.deleted_at, m.deleted_by,
            u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar,
            u.role as sender_role
     FROM messages m
     JOIN users u ON m.sender_id = u.id
     WHERE m.id = $1`,
    [messageId]
  );

  if (msgRes.rows.length === 0) return null;
  const m = msgRes.rows[0] as any;

  // If soft-deleted, redact content unless admin
  let displayContent = m.content;
  if (m.deleted_at) {
    displayContent = 'This message was deleted';
  }

  // Reply-to message preview
  let replyTo = null;
  if (m.reply_to_message_id) {
    const repRes = await db.query(
      `SELECT rm.id, rm.content, rm.message_type, rm.deleted_at, ru.display_name as sender_name
       FROM messages rm
       JOIN users ru ON rm.sender_id = ru.id
       WHERE rm.id = $1`,
      [m.reply_to_message_id]
    );
    if (repRes.rows.length > 0) {
      const rep = repRes.rows[0] as any;
      replyTo = {
        id: rep.id,
        content: rep.deleted_at ? 'Deleted message' : rep.content,
        message_type: rep.message_type,
        sender_name: rep.sender_name,
      };
    }
  }

  // Attachments
  const attRes = await db.query(
    `SELECT id, file_name, file_url, file_size, mime_type, duration_seconds, created_at
     FROM message_attachments
     WHERE message_id = $1`,
    [m.id]
  );

  // Reactions
  const reactRes = await db.query(
    `SELECT mr.id, mr.reaction, mr.user_id, mr.created_at, u.username, u.display_name
     FROM message_reactions mr
     JOIN users u ON mr.user_id = u.id
     WHERE mr.message_id = $1`,
    [m.id]
  );

  // Reads
  const readRes = await db.query(
    `SELECT mr.user_id, mr.read_at, u.display_name
     FROM message_reads mr
     JOIN users u ON mr.user_id = u.id
     WHERE mr.message_id = $1`,
    [m.id]
  );

  // Delivery status calculation
  let deliveryStatus: 'SENT' | 'DELIVERED' | 'READ' = 'SENT';
  const otherReads = readRes.rows.filter((r: any) => r.user_id !== m.sender_id);
  if (otherReads.length > 0) {
    deliveryStatus = 'READ';
  } else {
    // Check if any recipient is online
    const membersRes = await db.query(
      `SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id != $2`,
      [m.conversation_id, m.sender_id]
    );
    const anyOnline = membersRes.rows.some((mem: any) => isUserOnline(mem.user_id));
    if (anyOnline) {
      deliveryStatus = 'DELIVERED';
    }
  }

  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    content: displayContent,
    message_type: m.message_type,
    reply_to_message_id: m.reply_to_message_id,
    client_message_id: m.client_message_id,
    is_pinned: Boolean(m.is_pinned),
    created_at: m.created_at,
    updated_at: m.updated_at,
    edited_at: m.edited_at,
    deleted_at: m.deleted_at,
    sender: {
      id: m.sender_id,
      username: m.sender_username,
      display_name: m.sender_name,
      avatar_url: m.sender_avatar,
      role: m.sender_role,
    },
    reply_to: replyTo,
    attachments: attRes.rows,
    reactions: reactRes.rows,
    reads: readRes.rows,
    delivery_status: deliveryStatus,
  };
}

// GET /api/conversations/:id/messages
messagesRouter.get('/conversations/:id/messages', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.id;
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10), 100);
    const searchQuery = req.query.q ? String(req.query.q).trim().toLowerCase() : null;

    // Check membership
    const memCheck = await db.query(
      `SELECT id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [id, currentUserId]
    );

    if (memCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    let query = `
      SELECT m.id
      FROM messages m
      WHERE m.conversation_id = $1
        AND m.id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = $2)
    `;
    const params: any[] = [id, currentUserId];
    let idx = 3;

    if (searchQuery) {
      query += ` AND LOWER(m.content) LIKE $${idx++}`;
      params.push(`%${searchQuery}%`);
    }

    if (cursor) {
      query += ` AND m.created_at < $${idx++}`;
      params.push(cursor);
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${idx}`;
    params.push(limit);

    const rows = await db.query(query, params);
    const messageIds = rows.rows.map((r: any) => r.id);

    // Populate full details for each message
    const messages = [];
    for (const msgId of messageIds) {
      const fullMsg = await populateMessage(msgId, currentUserId);
      if (fullMsg) messages.push(fullMsg);
    }

    // Return chronological order (oldest first)
    messages.reverse();

    const nextCursor = rows.rows.length === limit ? (rows.rows[rows.rows.length - 1] as any).created_at : null;

    return res.json({
      messages,
      next_cursor: nextCursor,
      has_more: Boolean(nextCursor),
    });
  } catch (error: any) {
    console.error('[Get Messages Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

// POST /api/conversations/:id/messages
messagesRouter.post('/conversations/:id/messages', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.id;
    const {
      content,
      message_type = 'TEXT',
      reply_to_message_id,
      client_message_id,
      attachments = [],
    } = req.body;

    // Validate membership
    const memCheck = await db.query(
      `SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [id, currentUserId]
    );

    if (memCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    // If direct chat, verify other party hasn't blocked current user
    const convInfo = await db.query(`SELECT type FROM conversations WHERE id = $1`, [id]);
    if (convInfo.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if ((convInfo.rows[0] as any).type === 'DIRECT') {
      const otherMem = await db.query(
        `SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id != $2`,
        [id, currentUserId]
      );
      if (otherMem.rows.length > 0) {
        const otherUserId = (otherMem.rows[0] as any).user_id;
        const blockCheck = await db.query(
          `SELECT id FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
          [otherUserId, currentUserId]
        );
        if (blockCheck.rows.length > 0) {
          return res.status(403).json({ error: 'Cannot send message. You have been blocked by this user.' });
        }
      }
    }

    if ((!content || String(content).trim().length === 0) && attachments.length === 0) {
      return res.status(400).json({ error: 'Message content or attachment is required.' });
    }

    // Prevent duplicate submission with client_message_id
    if (client_message_id) {
      const dupCheck = await db.query(
        `SELECT id FROM messages WHERE conversation_id = $1 AND client_message_id = $2`,
        [id, client_message_id]
      );
      if (dupCheck.rows.length > 0) {
        const existing = await populateMessage((dupCheck.rows[0] as any).id, currentUserId);
        return res.json(existing);
      }
    }

    const messageId = 'msg_' + crypto.randomUUID();
    const cleanContent = content ? String(content).trim() : '';

    // PostgreSQL Transaction
    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO messages (id, conversation_id, sender_id, content, message_type, reply_to_message_id, client_message_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [messageId, id, currentUserId, cleanContent, message_type, reply_to_message_id || null, client_message_id || null]
      );

      // Save attachments
      for (const att of attachments) {
        const attId = 'att_' + crypto.randomUUID();
        await db.query(
          `INSERT INTO message_attachments (id, message_id, file_name, file_url, file_size, mime_type, duration_seconds, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [attId, messageId, att.file_name, att.file_url, att.file_size || 0, att.mime_type || 'application/octet-stream', att.duration_seconds || null]
        );
      }

      // Update conversation timestamp
      await db.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [id]);

      // Automatically mark read for sender
      await db.query(
        `UPDATE conversation_members
         SET last_read_message_id = $1, last_read_at = NOW()
         WHERE conversation_id = $2 AND user_id = $3`,
        [messageId, id, currentUserId]
      );

      await db.query('COMMIT');

      // Populate full message object
      const fullMessage = await populateMessage(messageId, currentUserId);

      // Emit real-time event to conversation room
      emitToConversation(id, 'message:new', {
        conversationId: id,
        message: fullMessage,
      });

      // Send in-app notification to offline/inactive conversation members
      const otherMembers = await db.query(
        `SELECT cm.user_id, p.push_notifications_enabled
         FROM conversation_members cm
         LEFT JOIN user_privacy_settings p ON cm.user_id = p.user_id
         WHERE cm.conversation_id = $1 AND cm.user_id != $2 AND cm.is_muted = FALSE`,
        [id, currentUserId]
      );

      for (const member of otherMembers.rows as any[]) {
        if (member.push_notifications_enabled ?? true) {
          const notifId = 'not_' + crypto.randomUUID();
          await db.query(
            `INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
             VALUES ($1, $2, 'NEW_MESSAGE', $3, $4, $5, NOW())`,
            [
              notifId,
              member.user_id,
              req.user!.display_name,
              cleanContent.slice(0, 100) || 'Sent an attachment',
              JSON.stringify({ conversationId: id, messageId }),
            ]
          );

          emitToUser(member.user_id, 'notification:new', {
            id: notifId,
            type: 'NEW_MESSAGE',
            title: req.user!.display_name,
            body: cleanContent.slice(0, 100) || 'Sent an attachment',
            data: { conversationId: id, messageId },
          });
        }
      }

      return res.status(201).json(fullMessage);
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  } catch (error: any) {
    console.error('[Send Message Error]', error);
    return res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

// PATCH /api/messages/:id (Edit message)
messagesRouter.patch('/messages/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const currentUserId = req.user!.id;

    if (!content || String(content).trim().length === 0) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }

    const msgRes = await db.query(`SELECT id, sender_id, conversation_id, deleted_at FROM messages WHERE id = $1`, [id]);
    if (msgRes.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const msg = msgRes.rows[0] as any;
    if (msg.sender_id !== currentUserId) {
      return res.status(403).json({ error: 'You can only edit your own messages' });
    }

    if (msg.deleted_at) {
      return res.status(400).json({ error: 'Cannot edit a deleted message' });
    }

    await db.query(
      `UPDATE messages
       SET content = $1, edited_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [String(content).trim(), id]
    );

    const updated = await populateMessage(id, currentUserId);
    emitToConversation(msg.conversation_id, 'message:updated', {
      conversationId: msg.conversation_id,
      message: updated,
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('[Edit Message Error]', error);
    return res.status(500).json({ error: 'Failed to edit message' });
  }
});

// DELETE /api/messages/:id?mode=for_everyone|for_me
messagesRouter.delete('/messages/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.id;
    const mode = req.query.mode === 'for_me' ? 'for_me' : 'for_everyone';

    const msgRes = await db.query(
      `SELECT m.id, m.sender_id, m.conversation_id, cm.role as my_group_role
       FROM messages m
       JOIN conversation_members cm ON m.conversation_id = cm.conversation_id AND cm.user_id = $2
       WHERE m.id = $1`,
      [id, currentUserId]
    );

    if (msgRes.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or not accessible' });
    }

    const msg = msgRes.rows[0] as any;
    const isSender = msg.sender_id === currentUserId;
    const isModerator = req.user!.role === 'MODERATOR' || req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';
    const isGroupAdmin = msg.my_group_role === 'OWNER' || msg.my_group_role === 'ADMIN';

    // Option 1: Delete for me (hides only for current user)
    if (mode === 'for_me') {
      const delId = 'del_' + crypto.randomUUID();
      await db.query(
        `INSERT INTO message_deletions (id, message_id, user_id, deleted_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (message_id, user_id) DO NOTHING`,
        [delId, id, currentUserId]
      );

      // Notify requesting user's sockets to remove locally
      emitToUser(currentUserId, 'message:deleted_for_me', {
        conversationId: msg.conversation_id,
        messageId: id,
      });

      return res.json({ success: true, mode: 'for_me', messageId: id });
    }

    // Option 2: Delete for everyone
    if (!isSender && !isModerator && !isGroupAdmin) {
      return res.status(403).json({ error: 'Permission denied to delete this message for everyone' });
    }

    // Significant moderation action: If deleted by non-author (moderator or group admin), audit log it
    if (!isSender) {
      await logAuditEvent(
        currentUserId,
        'FORCED_MESSAGE_DELETION',
        'MESSAGE',
        id,
        {
          conversationId: msg.conversation_id,
          senderId: msg.sender_id,
          deletedByRole: req.user!.role,
        },
        req
      );
    }

    // Soft delete in database
    await db.query(
      `UPDATE messages
       SET deleted_at = NOW(), deleted_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [currentUserId, id]
    );

    // Broadcast deletion event to all users in conversation
    emitToConversation(msg.conversation_id, 'message:deleted', {
      conversationId: msg.conversation_id,
      messageId: id,
      deletedBy: currentUserId,
      mode: 'for_everyone',
    });

    return res.json({ success: true, mode: 'for_everyone', messageId: id });
  } catch (error: any) {
    console.error('[Delete Message Error]', error);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
});

// POST /api/messages/:id/reactions (Toggle emoji reaction)
messagesRouter.post('/messages/:id/reactions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reaction } = req.body;
    const currentUserId = req.user!.id;

    if (!reaction) {
      return res.status(400).json({ error: 'Reaction emoji is required' });
    }

    const msgRes = await db.query(`SELECT id, conversation_id FROM messages WHERE id = $1`, [id]);
    if (msgRes.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const convId = (msgRes.rows[0] as any).conversation_id;

    // Check if user already reacted with this emoji
    const existing = await db.query(
      `SELECT id FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND reaction = $3`,
      [id, currentUserId, reaction]
    );

    if (existing.rows.length > 0) {
      // Toggle off: Remove reaction
      await db.query(`DELETE FROM message_reactions WHERE id = $1`, [(existing.rows[0] as any).id]);

      emitToConversation(convId, 'message:reaction_removed', {
        conversationId: convId,
        messageId: id,
        reaction,
        userId: currentUserId,
      });

      return res.json({ action: 'removed', reaction });
    } else {
      // Toggle on: Add reaction
      const reactId = 'rea_' + crypto.randomUUID();
      await db.query(
        `INSERT INTO message_reactions (id, message_id, user_id, reaction, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [reactId, id, currentUserId, reaction]
      );

      emitToConversation(convId, 'message:reaction_added', {
        conversationId: convId,
        messageId: id,
        reaction,
        userId: currentUserId,
        username: req.user!.username,
        display_name: req.user!.display_name,
      });

      return res.json({ action: 'added', reaction });
    }
  } catch (error: any) {
    console.error('[Reaction Error]', error);
    return res.status(500).json({ error: 'Failed to update reaction' });
  }
});

// POST /api/conversations/:id/read (Mark all messages as read)
messagesRouter.post('/conversations/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.id;

    // Update conversation_members last_read_at
    await db.query(
      `UPDATE conversation_members
       SET last_read_at = NOW()
       WHERE conversation_id = $1 AND user_id = $2`,
      [id, currentUserId]
    );

    // Get unread messages sent by others
    const unreadMsgs = await db.query(
      `SELECT id FROM messages
       WHERE conversation_id = $1
         AND sender_id != $2
         AND id NOT IN (SELECT message_id FROM message_reads WHERE user_id = $2)`,
      [id, currentUserId]
    );

    for (const msg of unreadMsgs.rows as any[]) {
      const readId = 'rd_' + crypto.randomUUID();
      await db.query(
        `INSERT INTO message_reads (id, message_id, user_id, read_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (message_id, user_id) DO NOTHING`,
        [readId, msg.id, currentUserId]
      );

      emitToConversation(id, 'message:read', {
        conversationId: id,
        messageId: msg.id,
        userId: currentUserId,
        readAt: new Date().toISOString(),
      });
    }

    return res.json({ success: true, count: unreadMsgs.rows.length });
  } catch (error: any) {
    console.error('[Mark Read Error]', error);
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// POST /api/messages/:id/pin (Toggle pin)
messagesRouter.post('/messages/:id/pin', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.id;

    const msgRes = await db.query(`SELECT id, conversation_id, is_pinned FROM messages WHERE id = $1`, [id]);
    if (msgRes.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const msg = msgRes.rows[0] as any;
    const newPinned = !msg.is_pinned;

    await db.query(`UPDATE messages SET is_pinned = $1 WHERE id = $2`, [newPinned, id]);
    const updated = await populateMessage(id, currentUserId);

    emitToConversation(msg.conversation_id, 'message:updated', {
      conversationId: msg.conversation_id,
      message: updated,
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('[Pin Message Error]', error);
    return res.status(500).json({ error: 'Failed to toggle pin' });
  }
});
