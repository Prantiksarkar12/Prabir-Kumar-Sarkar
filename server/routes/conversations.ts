import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, logAuditEvent } from '../middleware/auth';
import {
  emitToConversation,
  emitToUser,
  joinUserToConversation,
  isUserOnline
} from '../socket';

export const conversationsRouter = Router();

// GET /api/conversations
conversationsRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;

    // Get all conversations user is a member of
    const convRows = await db.query(
      `SELECT c.id, c.type, c.title, c.description, c.avatar_url, c.created_by, c.created_at, c.updated_at,
              cm.role as my_role, cm.is_pinned, cm.is_muted, cm.is_archived, cm.last_read_at
       FROM conversations c
       JOIN conversation_members cm ON c.id = cm.conversation_id
       WHERE cm.user_id = $1
       ORDER BY cm.is_pinned DESC, c.updated_at DESC`,
      [currentUserId]
    );

    const conversations = [];

    for (const c of convRows.rows as any[]) {
      // Get all members for this conversation
      const membersRes = await db.query(
        `SELECT cm.id, cm.user_id, cm.role, cm.joined_at,
                u.username, u.display_name, u.avatar_url, u.role as platform_role, u.last_seen_at
         FROM conversation_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.conversation_id = $1`,
        [c.id]
      );

      const members = membersRes.rows.map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        user: {
          id: m.user_id,
          username: m.username,
          display_name: m.display_name,
          avatar_url: m.avatar_url,
          role: m.platform_role,
          last_seen_at: m.last_seen_at,
          is_online: isUserOnline(m.user_id),
        },
      }));

      // Get last message
      const lastMsgRes = await db.query(
        `SELECT m.id, m.content, m.message_type, m.created_at, m.sender_id, u.display_name as sender_name
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
         ORDER BY m.created_at DESC
         LIMIT 1`,
        [c.id]
      );

      const lastMessage = lastMsgRes.rows[0] || null;

      // Count unread messages
      let unreadCount = 0;
      if (c.last_read_at) {
        const unreadRes = await db.query(
          `SELECT COUNT(*) as count
           FROM messages
           WHERE conversation_id = $1
             AND sender_id != $2
             AND created_at > $3
             AND deleted_at IS NULL`,
          [c.id, currentUserId, c.last_read_at]
        );
        unreadCount = parseInt((unreadRes.rows[0] as any).count, 10);
      } else {
        const unreadRes = await db.query(
          `SELECT COUNT(*) as count
           FROM messages
           WHERE conversation_id = $1
             AND sender_id != $2
             AND deleted_at IS NULL`,
          [c.id, currentUserId]
        );
        unreadCount = parseInt((unreadRes.rows[0] as any).count, 10);
      }

      // If direct conversation, format title & avatar from other member
      let displayTitle = c.title;
      let displayAvatar = c.avatar_url;

      if (c.type === 'DIRECT') {
        const otherMember = members.find((m: any) => m.user_id !== currentUserId);
        if (otherMember) {
          displayTitle = otherMember.user.display_name || otherMember.user.username;
          displayAvatar = otherMember.user.avatar_url;
        } else {
          displayTitle = 'Notes to Self';
        }
      }

      conversations.push({
        id: c.id,
        type: c.type,
        title: displayTitle,
        description: c.description,
        avatar_url: displayAvatar,
        created_by: c.created_by,
        created_at: c.created_at,
        updated_at: c.updated_at,
        is_pinned: Boolean(c.is_pinned),
        is_muted: Boolean(c.is_muted),
        is_archived: Boolean(c.is_archived),
        my_role: c.my_role,
        members,
        last_message: lastMessage,
        unread_count: unreadCount,
      });
    }

    return res.json(conversations);
  } catch (error: any) {
    console.error('[Get Conversations Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve conversations' });
  }
});

// POST /api/conversations/direct
conversationsRouter.post('/direct', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    // Check if either party blocked the other
    const blockCheck = await db.query(
      `SELECT id FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [currentUserId, targetUserId]
    );

    if (blockCheck.rows.length > 0) {
      return res.status(403).json({ error: 'Cannot start conversation due to user privacy/blocking restrictions.' });
    }

    // Check if target user exists
    const targetUserRes = await db.query(`SELECT id, username, display_name FROM users WHERE id = $1`, [targetUserId]);
    if (targetUserRes.rows.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Check if direct conversation already exists between these 2 users
    const existingConv = await db.query(
      `SELECT c.id
       FROM conversations c
       JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = $1
       JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = $2
       WHERE c.type = 'DIRECT'
       LIMIT 1`,
      [currentUserId, targetUserId]
    );

    if (existingConv.rows.length > 0) {
      return res.json({ id: (existingConv.rows[0] as any).id, is_existing: true });
    }

    // Create new direct conversation in transaction
    const convId = 'cnv_' + crypto.randomUUID();
    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO conversations (id, type, created_by, created_at, updated_at)
         VALUES ($1, 'DIRECT', $2, NOW(), NOW())`,
        [convId, currentUserId]
      );

      const mem1Id = 'mem_' + crypto.randomUUID();
      const mem2Id = 'mem_' + crypto.randomUUID();

      await db.query(
        `INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'MEMBER', NOW())`,
        [mem1Id, convId, currentUserId]
      );

      await db.query(
        `INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'MEMBER', NOW())`,
        [mem2Id, convId, targetUserId]
      );

      await db.query('COMMIT');

      // Join sockets to conversation room
      joinUserToConversation(currentUserId, convId);
      joinUserToConversation(targetUserId, convId);

      emitToUser(targetUserId, 'conversation:created', { conversationId: convId });
      emitToUser(currentUserId, 'conversation:created', { conversationId: convId });

      return res.status(201).json({ id: convId, is_existing: false });
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  } catch (error: any) {
    console.error('[Create Direct Conversation Error]', error);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// POST /api/conversations/group
conversationsRouter.post('/group', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { title, description, memberUserIds = [] } = req.body;

    if (!title || String(title).trim().length === 0) {
      return res.status(400).json({ error: 'Group title is required' });
    }

    const cleanTitle = String(title).trim();
    const cleanDesc = description ? String(description).trim() : '';
    const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(cleanTitle)}`;

    const convId = 'grp_' + crypto.randomUUID();

    // Ensure member IDs are unique and filter current user
    const memberSet = new Set<string>(memberUserIds);
    memberSet.delete(currentUserId);
    const validTargetIds = Array.from(memberSet);

    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO conversations (id, type, title, description, avatar_url, created_by, created_at, updated_at)
         VALUES ($1, 'GROUP', $2, $3, $4, $5, NOW(), NOW())`,
        [convId, cleanTitle, cleanDesc, avatarUrl, currentUserId]
      );

      // Creator is OWNER
      const ownerMemId = 'mem_' + crypto.randomUUID();
      await db.query(
        `INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'OWNER', NOW())`,
        [ownerMemId, convId, currentUserId]
      );

      // Add other members
      for (const targetId of validTargetIds) {
        const memId = 'mem_' + crypto.randomUUID();
        await db.query(
          `INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
           VALUES ($1, $2, $3, 'MEMBER', NOW())`,
          [memId, convId, targetId]
        );
      }

      // Initial system message
      const sysMsgId = 'msg_' + crypto.randomUUID();
      await db.query(
        `INSERT INTO messages (id, conversation_id, sender_id, content, message_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'SYSTEM', NOW(), NOW())`,
        [sysMsgId, convId, currentUserId, `${req.user!.display_name} created the group "${cleanTitle}"`]
      );

      await db.query('COMMIT');

      // Socket sync
      joinUserToConversation(currentUserId, convId);
      for (const targetId of validTargetIds) {
        joinUserToConversation(targetId, convId);
        emitToUser(targetId, 'conversation:created', { conversationId: convId });
      }
      emitToUser(currentUserId, 'conversation:created', { conversationId: convId });

      await logAuditEvent(currentUserId, 'GROUP_CREATED', 'CONVERSATION', convId, { title: cleanTitle, memberCount: validTargetIds.length + 1 }, req);

      return res.status(201).json({ id: convId, title: cleanTitle });
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  } catch (error: any) {
    console.error('[Create Group Error]', error);
    return res.status(500).json({ error: 'Failed to create group' });
  }
});

// GET /api/conversations/:id
conversationsRouter.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.id;

    // Check membership
    const memberCheck = await db.query(
      `SELECT role, is_pinned, is_muted, is_archived, last_read_at
       FROM conversation_members
       WHERE conversation_id = $1 AND user_id = $2`,
      [id, currentUserId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    const membership = memberCheck.rows[0] as any;

    const convRes = await db.query(
      `SELECT c.id, c.type, c.title, c.description, c.avatar_url, c.created_by, c.created_at, c.updated_at
       FROM conversations c
       WHERE c.id = $1`,
      [id]
    );

    if (convRes.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conv = convRes.rows[0] as any;

    // Fetch members
    const membersRes = await db.query(
      `SELECT cm.id, cm.user_id, cm.role, cm.joined_at,
              u.username, u.display_name, u.avatar_url, u.bio, u.role as platform_role, u.last_seen_at
       FROM conversation_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.conversation_id = $1
       ORDER BY cm.role = 'OWNER' DESC, cm.role = 'ADMIN' DESC, u.display_name ASC`,
      [id]
    );

    const members = membersRes.rows.map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      user: {
        id: m.user_id,
        username: m.username,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
        bio: m.bio,
        role: m.platform_role,
        last_seen_at: m.last_seen_at,
        is_online: isUserOnline(m.user_id),
      },
    }));

    let displayTitle = conv.title;
    let displayAvatar = conv.avatar_url;

    if (conv.type === 'DIRECT') {
      const other = members.find((m: any) => m.user_id !== currentUserId);
      if (other) {
        displayTitle = other.user.display_name || other.user.username;
        displayAvatar = other.user.avatar_url;
      }
    }

    return res.json({
      ...conv,
      title: displayTitle,
      avatar_url: displayAvatar,
      my_role: membership.role,
      is_pinned: membership.is_pinned,
      is_muted: membership.is_muted,
      is_archived: membership.is_archived,
      members,
    });
  } catch (error: any) {
    console.error('[Get Single Conversation Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve conversation' });
  }
});

// PATCH /api/conversations/:id
conversationsRouter.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, avatar_url } = req.body;
    const currentUserId = req.user!.id;

    // Check if user is OWNER or ADMIN
    const memberCheck = await db.query(
      `SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [id, currentUserId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const role = (memberCheck.rows[0] as any).role;
    if (role !== 'OWNER' && role !== 'ADMIN' && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only group owners and admins can edit group information' });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (title && String(title).trim().length > 0) {
      updates.push(`title = $${idx++}`);
      values.push(String(title).trim());
    }

    if (typeof description === 'string') {
      updates.push(`description = $${idx++}`);
      values.push(description.trim());
    }

    if (avatar_url) {
      updates.push(`avatar_url = $${idx++}`);
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    const updated = await db.query(query, values);

    // Emit event
    emitToConversation(id, 'conversation:updated', updated.rows[0]);

    return res.json(updated.rows[0]);
  } catch (error: any) {
    console.error('[Update Conversation Error]', error);
    return res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// POST /api/conversations/:id/members
conversationsRouter.post('/:id/members', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const currentUserId = req.user!.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check permission: OWNER or ADMIN
    const myMembership = await db.query(
      `SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [id, currentUserId]
    );

    if (myMembership.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const role = (myMembership.rows[0] as any).role;
    if (role !== 'OWNER' && role !== 'ADMIN' && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only owners and admins can add members' });
    }

    // Insert new member
    const memId = 'mem_' + crypto.randomUUID();
    await db.query(
      `INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, 'MEMBER', NOW())
       ON CONFLICT (conversation_id, user_id) DO NOTHING`,
      [memId, id, userId]
    );

    // Fetch added user details
    const userRes = await db.query(`SELECT id, username, display_name, avatar_url, role FROM users WHERE id = $1`, [userId]);
    const addedUser = userRes.rows[0] as any;

    // System message
    const sysId = 'msg_' + crypto.randomUUID();
    await db.query(
      `INSERT INTO messages (id, conversation_id, sender_id, content, message_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SYSTEM', NOW(), NOW())`,
      [sysId, id, currentUserId, `${req.user!.display_name} added ${addedUser?.display_name || 'a member'} to the group`]
    );

    joinUserToConversation(userId, id);
    emitToConversation(id, 'conversation:member_added', {
      conversationId: id,
      member: {
        id: memId,
        user_id: userId,
        role: 'MEMBER',
        user: addedUser,
      },
    });

    emitToUser(userId, 'conversation:created', { conversationId: id });

    return res.json({ success: true, message: 'Member added' });
  } catch (error: any) {
    console.error('[Add Member Error]', error);
    return res.status(500).json({ error: 'Failed to add member' });
  }
});

// DELETE /api/conversations/:id/members/:targetUserId
conversationsRouter.delete('/:id/members/:targetUserId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, targetUserId } = req.params;
    const currentUserId = req.user!.id;

    // Check my role
    const myMembership = await db.query(
      `SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [id, currentUserId]
    );

    if (myMembership.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const myRole = (myMembership.rows[0] as any).role;
    const isSelf = currentUserId === targetUserId;

    if (!isSelf && myRole !== 'OWNER' && myRole !== 'ADMIN' && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get target info
    const targetRes = await db.query(`SELECT display_name FROM users WHERE id = $1`, [targetUserId]);
    const targetName = (targetRes.rows[0] as any)?.display_name || 'Member';

    await db.query(`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [id, targetUserId]);

    // System message
    const sysId = 'msg_' + crypto.randomUUID();
    const actionText = isSelf ? `${targetName} left the group` : `${req.user!.display_name} removed ${targetName} from the group`;

    await db.query(
      `INSERT INTO messages (id, conversation_id, sender_id, content, message_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SYSTEM', NOW(), NOW())`,
      [sysId, id, currentUserId, actionText]
    );

    emitToConversation(id, 'conversation:member_removed', {
      conversationId: id,
      userId: targetUserId,
    });

    return res.json({ success: true, message: 'Member removed' });
  } catch (error: any) {
    console.error('[Remove Member Error]', error);
    return res.status(500).json({ error: 'Failed to remove member' });
  }
});

// PATCH /api/conversations/:id/settings
conversationsRouter.patch('/:id/settings', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { is_pinned, is_muted, is_archived } = req.body;
    const currentUserId = req.user!.id;

    const updates = [];
    const values = [];
    let idx = 1;

    if (typeof is_pinned === 'boolean') {
      updates.push(`is_pinned = $${idx++}`);
      values.push(is_pinned);
    }
    if (typeof is_muted === 'boolean') {
      updates.push(`is_muted = $${idx++}`);
      values.push(is_muted);
    }
    if (typeof is_archived === 'boolean') {
      updates.push(`is_archived = $${idx++}`);
      values.push(is_archived);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No settings provided' });
    }

    values.push(id, currentUserId);
    const query = `
      UPDATE conversation_members
      SET ${updates.join(', ')}
      WHERE conversation_id = $${idx++} AND user_id = $${idx}
      RETURNING *
    `;

    const resUpdate = await db.query(query, values);
    return res.json(resUpdate.rows[0]);
  } catch (error: any) {
    console.error('[Update Conv Settings Error]', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});
