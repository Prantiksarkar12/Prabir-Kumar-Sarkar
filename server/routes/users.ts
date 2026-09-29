import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, logAuditEvent } from '../middleware/auth';
import { isUserOnline } from '../socket';

export const usersRouter = Router();

// GET /api/users/me
usersRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRes = await db.query(
      `SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.bio, u.role, u.is_banned, u.last_seen_at, u.created_at, u.updated_at
       FROM users u
       WHERE u.id = $1`,
      [req.user!.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(userRes.rows[0]);
  } catch (error: any) {
    console.error('[User Me Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// PATCH /api/users/me
usersRouter.patch('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { display_name, bio, avatar_url } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (typeof display_name === 'string' && display_name.trim().length > 0) {
      updates.push(`display_name = $${idx++}`);
      values.push(display_name.trim());
    }

    if (typeof bio === 'string') {
      updates.push(`bio = $${idx++}`);
      values.push(bio.trim());
    }

    if (typeof avatar_url === 'string') {
      updates.push(`avatar_url = $${idx++}`);
      values.push(avatar_url.trim());
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.user!.id);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING id, username, display_name, email, avatar_url, bio, role, is_banned, last_seen_at, created_at, updated_at
    `;

    const result = await db.query(query, values);
    return res.json(result.rows[0]);
  } catch (error: any) {
    console.error('[Update User Error]', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/users/search?q=...
usersRouter.get('/search', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) {
      return res.json([]);
    }

    // Search users matching username or display_name, excluding current user and users who blocked current user
    const usersRes = await db.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.role, u.last_seen_at
       FROM users u
       WHERE u.id != $1
         AND u.is_banned = FALSE
         AND (LOWER(u.username) LIKE $2 OR LOWER(u.display_name) LIKE $2)
         AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
       ORDER BY u.username ASC
       LIMIT 30`,
      [req.user!.id, `%${q}%`]
    );

    const results = usersRes.rows.map((user: any) => ({
      ...user,
      is_online: isUserOnline(user.id),
    }));

    return res.json(results);
  } catch (error: any) {
    console.error('[Search Users Error]', error);
    return res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/users/:id
usersRouter.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId = req.params.id;

    // Check if target has blocked current user
    const blockRes = await db.query(
      `SELECT id FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [targetId, req.user!.id]
    );

    const isBlocked = blockRes.rows.length > 0;

    const userRes = await db.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.role, u.last_seen_at,
              p.who_can_see_online, p.who_can_see_last_seen
       FROM users u
       LEFT JOIN user_privacy_settings p ON u.id = p.user_id
       WHERE u.id = $1`,
      [targetId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = userRes.rows[0] as any;
    const isOnline = isUserOnline(u.id);

    // Apply privacy visibility
    const canSeeOnline = !isBlocked && (u.who_can_see_online === 'EVERYONE');
    const canSeeLastSeen = !isBlocked && (u.who_can_see_last_seen === 'EVERYONE');

    return res.json({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      bio: u.bio,
      role: u.role,
      is_online: canSeeOnline ? isOnline : false,
      last_seen_at: canSeeLastSeen ? u.last_seen_at : null,
      is_blocked: isBlocked,
    });
  } catch (error: any) {
    console.error('[Get User Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

// GET /api/users/me/privacy
usersRouter.get('/me/privacy', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const resPrivacy = await db.query(`SELECT * FROM user_privacy_settings WHERE user_id = $1`, [req.user!.id]);
    if (resPrivacy.rows.length === 0) {
      return res.json({
        who_can_message: 'EVERYONE',
        who_can_see_online: 'EVERYONE',
        who_can_see_last_seen: 'EVERYONE',
        who_can_add_to_groups: 'EVERYONE',
        read_receipts_enabled: true,
        push_notifications_enabled: true,
      });
    }
    return res.json(resPrivacy.rows[0]);
  } catch (error: any) {
    console.error('[Get Privacy Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve privacy settings' });
  }
});

// PATCH /api/users/me/privacy
usersRouter.patch('/me/privacy', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      who_can_message,
      who_can_see_online,
      who_can_see_last_seen,
      who_can_add_to_groups,
      read_receipts_enabled,
      push_notifications_enabled,
    } = req.body;

    await db.query(
      `INSERT INTO user_privacy_settings (
        user_id, who_can_message, who_can_see_online, who_can_see_last_seen, who_can_add_to_groups, read_receipts_enabled, push_notifications_enabled, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        who_can_message = EXCLUDED.who_can_message,
        who_can_see_online = EXCLUDED.who_can_see_online,
        who_can_see_last_seen = EXCLUDED.who_can_see_last_seen,
        who_can_add_to_groups = EXCLUDED.who_can_add_to_groups,
        read_receipts_enabled = EXCLUDED.read_receipts_enabled,
        push_notifications_enabled = EXCLUDED.push_notifications_enabled,
        updated_at = NOW()`,
      [
        req.user!.id,
        who_can_message || 'EVERYONE',
        who_can_see_online || 'EVERYONE',
        who_can_see_last_seen || 'EVERYONE',
        who_can_add_to_groups || 'EVERYONE',
        read_receipts_enabled ?? true,
        push_notifications_enabled ?? true,
      ]
    );

    return res.json({ success: true, message: 'Privacy settings saved.' });
  } catch (error: any) {
    console.error('[Update Privacy Error]', error);
    return res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

// POST /api/users/:id/block
usersRouter.post('/:id/block', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user!.id) {
      return res.status(400).json({ error: 'You cannot block yourself' });
    }

    const blockId = 'blk_' + crypto.randomUUID();
    await db.query(
      `INSERT INTO blocks (id, blocker_id, blocked_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [blockId, req.user!.id, targetId]
    );

    await logAuditEvent(req.user!.id, 'USER_BLOCKED', 'USER', targetId, {}, req);

    return res.json({ success: true, message: 'User blocked' });
  } catch (error: any) {
    console.error('[Block Error]', error);
    return res.status(500).json({ error: 'Failed to block user' });
  }
});

// DELETE /api/users/:id/block
usersRouter.delete('/:id/block', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId = req.params.id;
    await db.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [req.user!.id, targetId]);

    await logAuditEvent(req.user!.id, 'USER_UNBLOCKED', 'USER', targetId, {}, req);

    return res.json({ success: true, message: 'User unblocked' });
  } catch (error: any) {
    console.error('[Unblock Error]', error);
    return res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// GET /api/users/me/blocks
usersRouter.get('/me/blocks', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const resBlocks = await db.query(
      `SELECT b.id, b.blocked_id, b.created_at, u.username, u.display_name, u.avatar_url
       FROM blocks b
       JOIN users u ON b.blocked_id = u.id
       WHERE b.blocker_id = $1
       ORDER BY b.created_at DESC`,
      [req.user!.id]
    );
    return res.json(resBlocks.rows);
  } catch (error: any) {
    console.error('[Get Blocks Error]', error);
    return res.status(500).json({ error: 'Failed to get blocks' });
  }
});

// GET /api/users/me/sessions
usersRouter.get('/me/sessions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionsRes = await db.query(
      `SELECT id, device_info, ip_address, expires_at, created_at, last_active_at,
              (id = $2) as is_current
       FROM sessions
       WHERE user_id = $1
       ORDER BY last_active_at DESC`,
      [req.user!.id, req.user!.session_id]
    );
    return res.json(sessionsRes.rows);
  } catch (error: any) {
    console.error('[Get Sessions Error]', error);
    return res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// DELETE /api/users/me/sessions/:sessionId
usersRouter.delete('/me/sessions/:sessionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    await db.query(`DELETE FROM sessions WHERE id = $1 AND user_id = $2`, [sessionId, req.user!.id]);
    return res.json({ success: true, message: 'Session revoked' });
  } catch (error: any) {
    console.error('[Revoke Session Error]', error);
    return res.status(500).json({ error: 'Failed to revoke session' });
  }
});
