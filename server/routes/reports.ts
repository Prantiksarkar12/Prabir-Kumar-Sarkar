import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, requireRole, logAuditEvent } from '../middleware/auth';

export const reportsRouter = Router();

// POST /api/reports
reportsRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { reported_user_id, message_id, conversation_id, reason, description } = req.body;

    if (!reason || String(reason).trim().length === 0) {
      return res.status(400).json({ error: 'A reason for the report is required' });
    }

    const reportId = 'rep_' + crypto.randomUUID();

    await db.query(
      `INSERT INTO reports (id, reporter_id, reported_user_id, message_id, conversation_id, reason, description, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', NOW())`,
      [
        reportId,
        currentUserId,
        reported_user_id || null,
        message_id || null,
        conversation_id || null,
        String(reason).trim(),
        description ? String(description).trim() : null,
      ]
    );

    await logAuditEvent(currentUserId, 'REPORT_SUBMITTED', 'REPORT', reportId, { reason }, req);

    return res.status(201).json({ success: true, message: 'Report submitted for moderation review.' });
  } catch (error: any) {
    console.error('[Create Report Error]', error);
    return res.status(500).json({ error: 'Failed to submit report' });
  }
});

// GET /api/reports (Moderators and Admins)
reportsRouter.get('/', requireAuth, requireRole('MODERATOR', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;

    let query = `
      SELECT r.id, r.reporter_id, r.reported_user_id, r.message_id, r.conversation_id,
             r.reason, r.description, r.status, r.resolution_notes, r.reviewed_by, r.reviewed_at, r.created_at,
             u1.username as reporter_username, u1.display_name as reporter_name,
             u2.username as reported_username, u2.display_name as reported_name, u2.role as reported_role, u2.is_banned as reported_banned,
             m.content as message_content, m.deleted_at as message_deleted_at
      FROM reports r
      LEFT JOIN users u1 ON r.reporter_id = u1.id
      LEFT JOIN users u2 ON r.reported_user_id = u2.id
      LEFT JOIN messages m ON r.message_id = m.id
    `;

    const params: any[] = [];
    if (status) {
      query += ` WHERE r.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY r.created_at DESC LIMIT 100`;

    const reportsRes = await db.query(query, params);
    return res.json(reportsRes.rows);
  } catch (error: any) {
    console.error('[List Reports Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve reports' });
  }
});

// PATCH /api/reports/:id (Resolve or Dismiss)
reportsRouter.patch('/:id', requireAuth, requireRole('MODERATOR', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes, action_taken } = req.body;
    const currentUserId = req.user!.id;

    if (!status || !['RESOLVED', 'DISMISSED', 'UNDER_REVIEW'].includes(status.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updated = await db.query(
      `UPDATE reports
       SET status = $1, resolution_notes = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status.toUpperCase(), resolution_notes || null, currentUserId, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    await logAuditEvent(currentUserId, 'REPORT_RESOLVED', 'REPORT', id, { status, action_taken }, req);

    return res.json(updated.rows[0]);
  } catch (error: any) {
    console.error('[Update Report Error]', error);
    return res.status(500).json({ error: 'Failed to update report' });
  }
});
