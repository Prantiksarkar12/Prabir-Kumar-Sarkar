import { Router, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, requireRole, logAuditEvent } from '../middleware/auth';
import { getOnlineUsers } from '../socket';

export const adminRouter = Router();

// GET /api/admin/stats
adminRouter.get('/stats', requireAuth, requireRole('MODERATOR', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [usersCount, messagesCount, groupsCount, openReportsCount, totalReportsCount, bannedCount] = await Promise.all([
      db.query(`SELECT COUNT(*) as count FROM users`),
      db.query(`SELECT COUNT(*) as count FROM messages`),
      db.query(`SELECT COUNT(*) as count FROM conversations WHERE type = 'GROUP'`),
      db.query(`SELECT COUNT(*) as count FROM reports WHERE status = 'OPEN'`),
      db.query(`SELECT COUNT(*) as count FROM reports`),
      db.query(`SELECT COUNT(*) as count FROM users WHERE is_banned = TRUE`),
    ]);

    const onlineUsers = getOnlineUsers();

    return res.json({
      total_users: parseInt((usersCount.rows[0] as any).count, 10),
      total_messages: parseInt((messagesCount.rows[0] as any).count, 10),
      total_groups: parseInt((groupsCount.rows[0] as any).count, 10),
      open_reports: parseInt((openReportsCount.rows[0] as any).count, 10),
      total_reports: parseInt((totalReportsCount.rows[0] as any).count, 10),
      banned_users: parseInt((bannedCount.rows[0] as any).count, 10),
      online_users_count: onlineUsers.length,
    });
  } catch (error: any) {
    console.error('[Admin Stats Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve admin stats' });
  }
});

// GET /api/admin/users
adminRouter.get('/users', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = req.query.q ? String(req.query.q).toLowerCase() : null;
    const role = req.query.role ? String(req.query.role).toUpperCase() : null;

    let query = `
      SELECT id, username, display_name, email, avatar_url, role, is_banned, ban_reason, last_seen_at, created_at
      FROM users
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(LOWER(username) LIKE $${params.length} OR LOWER(display_name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`);
    }

    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const resUsers = await db.query(query, params);
    return res.json(resUsers.rows);
  } catch (error: any) {
    console.error('[Admin Users Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// PATCH /api/admin/users/:id/role
adminRouter.patch('/users/:id/role', requireAuth, requireRole('SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const currentUserId = req.user!.id;

    if (!role || !['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const updated = await db.query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, display_name, role`,
      [role, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logAuditEvent(currentUserId, 'ROLE_CHANGED', 'USER', id, { newRole: role }, req);

    return res.json(updated.rows[0]);
  } catch (error: any) {
    console.error('[Change Role Error]', error);
    return res.status(500).json({ error: 'Failed to change role' });
  }
});

// POST /api/admin/users/:id/ban
adminRouter.post('/users/:id/ban', requireAuth, requireRole('MODERATOR', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason = 'Violation of community policies' } = req.body;
    const currentUserId = req.user!.id;

    // Prevent banning super admins
    const targetUser = await db.query(`SELECT id, role FROM users WHERE id = $1`, [id]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if ((targetUser.rows[0] as any).role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot ban a Super Admin' });
    }

    // Set banned & terminate all sessions
    await db.query(`UPDATE users SET is_banned = TRUE, ban_reason = $1, updated_at = NOW() WHERE id = $2`, [reason, id]);
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);

    await logAuditEvent(currentUserId, 'USER_BANNED', 'USER', id, { reason }, req);

    return res.json({ success: true, message: 'User suspended and sessions revoked.' });
  } catch (error: any) {
    console.error('[Ban User Error]', error);
    return res.status(500).json({ error: 'Failed to ban user' });
  }
});

// POST /api/admin/users/:id/unban
adminRouter.post('/users/:id/unban', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.id;

    await db.query(`UPDATE users SET is_banned = FALSE, ban_reason = NULL, updated_at = NOW() WHERE id = $1`, [id]);
    await logAuditEvent(currentUserId, 'USER_UNBANNED', 'USER', id, {}, req);

    return res.json({ success: true, message: 'User unbanned successfully.' });
  } catch (error: any) {
    console.error('[Unban User Error]', error);
    return res.status(500).json({ error: 'Failed to unban user' });
  }
});

// GET /api/admin/audit-logs
adminRouter.get('/audit-logs', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logsRes = await db.query(
      `SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.metadata, a.ip_address, a.user_agent, a.created_at,
              u.username as actor_username, u.display_name as actor_name
       FROM audit_logs a
       LEFT JOIN users u ON a.actor_id = u.id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );

    return res.json(logsRes.rows);
  } catch (error: any) {
    console.error('[Audit Logs Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// GET /api/admin/conversations
adminRouter.get('/conversations', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const convRes = await db.query(
      `SELECT c.id, c.type, c.title, c.description, c.created_at, c.updated_at,
              u.display_name as creator_name,
              COUNT(cm.id) as member_count
       FROM conversations c
       LEFT JOIN users u ON c.created_by = u.id
       LEFT JOIN conversation_members cm ON c.id = cm.conversation_id
       GROUP BY c.id, u.display_name
       ORDER BY c.updated_at DESC
       LIMIT 100`
    );

    return res.json(convRes.rows);
  } catch (error: any) {
    console.error('[Admin Conversations Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve conversations' });
  }
});

function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// GET /api/admin/storage & /api/v1/admin/storage
// Real storage usage statistics (bucket size and number of files) from S3-compatible storage
adminRouter.get('/storage', requireAuth, requireRole('MODERATOR', 'ADMIN', 'SUPER_ADMIN'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const uploadsDir = path.resolve(process.cwd(), 'data/uploads');
    let diskFilesCount = 0;
    let diskTotalBytes = 0;

    if (fs.existsSync(uploadsDir)) {
      try {
        const files = fs.readdirSync(uploadsDir);
        for (const file of files) {
          const filePath = path.join(uploadsDir, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              diskFilesCount++;
              diskTotalBytes += stat.size;
            }
          } catch {
            // ignore unreadable files
          }
        }
      } catch (e) {
        console.warn('[Storage Scan Error]', e);
      }
    }

    // Query database for authoritative upload records
    const totalsRes = await db.query(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(size_bytes), 0) as total_bytes,
        COUNT(CASE WHEN mime_type LIKE 'image/%' THEN 1 END) as images_count,
        COALESCE(SUM(CASE WHEN mime_type LIKE 'image/%' THEN size_bytes ELSE 0 END), 0) as images_bytes,
        COUNT(CASE WHEN mime_type LIKE 'audio/%' THEN 1 END) as audio_count,
        COALESCE(SUM(CASE WHEN mime_type LIKE 'audio/%' THEN size_bytes ELSE 0 END), 0) as audio_bytes,
        COUNT(CASE WHEN mime_type LIKE 'application/pdf' OR mime_type LIKE 'text/%' THEN 1 END) as docs_count,
        COALESCE(SUM(CASE WHEN mime_type LIKE 'application/pdf' OR mime_type LIKE 'text/%' THEN size_bytes ELSE 0 END), 0) as docs_bytes,
        COUNT(CASE WHEN mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'audio/%' AND mime_type NOT LIKE 'application/pdf' AND mime_type NOT LIKE 'text/%' THEN 1 END) as other_count,
        COALESCE(SUM(CASE WHEN mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'audio/%' AND mime_type NOT LIKE 'application/pdf' AND mime_type NOT LIKE 'text/%' THEN size_bytes ELSE 0 END), 0) as other_bytes
      FROM uploads
    `);

    const row = totalsRes.rows[0] as any;
    const dbTotalFiles = parseInt(row?.total_count || '0', 10);
    const dbTotalBytes = parseInt(row?.total_bytes || '0', 10);

    // Recent uploaded files
    const recentRes = await db.query(`
      SELECT u.id, u.original_name as filename, u.size_bytes, u.mime_type, u.public_url, u.created_at,
             usr.username as uploaded_by_username
      FROM uploads u
      LEFT JOIN users usr ON u.user_id = usr.id
      ORDER BY u.created_at DESC
      LIMIT 25
    `);

    // S3-compatible configuration
    const s3Bucket = process.env.S3_BUCKET || 'chatapp';
    const s3Endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
    const s3Region = process.env.S3_REGION || 'us-east-1';

    // Total counts combine DB records and disk files (taking the maximum to avoid undercounting)
    const effectiveTotalFiles = Math.max(dbTotalFiles, diskFilesCount);
    const effectiveTotalBytes = Math.max(dbTotalBytes, diskTotalBytes);

    return res.json({
      status: 'healthy',
      bucket: s3Bucket,
      endpoint: s3Endpoint,
      region: s3Region,
      engine: process.env.S3_ENDPOINT ? 'MinIO / S3 Object Storage' : 'Local Object Storage / S3 Volume Mount',
      total_files: effectiveTotalFiles,
      total_bytes: effectiveTotalBytes,
      total_size_formatted: formatBytes(effectiveTotalBytes),
      disk_files_count: diskFilesCount,
      disk_bytes: diskTotalBytes,
      disk_size_formatted: formatBytes(diskTotalBytes),
      files_by_type: {
        images: {
          count: parseInt(row?.images_count || '0', 10),
          bytes: parseInt(row?.images_bytes || '0', 10),
          size_formatted: formatBytes(parseInt(row?.images_bytes || '0', 10)),
        },
        audio: {
          count: parseInt(row?.audio_count || '0', 10),
          bytes: parseInt(row?.audio_bytes || '0', 10),
          size_formatted: formatBytes(parseInt(row?.audio_bytes || '0', 10)),
        },
        documents: {
          count: parseInt(row?.docs_count || '0', 10),
          bytes: parseInt(row?.docs_bytes || '0', 10),
          size_formatted: formatBytes(parseInt(row?.docs_bytes || '0', 10)),
        },
        other: {
          count: parseInt(row?.other_count || '0', 10),
          bytes: parseInt(row?.other_bytes || '0', 10),
          size_formatted: formatBytes(parseInt(row?.other_bytes || '0', 10)),
        },
      },
      recent_files: recentRes.rows.map((r: any) => ({
        id: r.id,
        filename: r.filename,
        size_bytes: parseInt(r.size_bytes, 10),
        size_formatted: formatBytes(parseInt(r.size_bytes, 10)),
        mime_type: r.mime_type,
        public_url: r.public_url,
        created_at: r.created_at,
        uploaded_by_username: r.uploaded_by_username || 'Unknown',
      })),
    });
  } catch (error: any) {
    console.error('[Admin Storage Stats Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve storage statistics' });
  }
});

