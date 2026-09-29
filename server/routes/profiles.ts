import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, requireRole, logAuditEvent } from '../middleware/auth';

export const profilesRouter = Router();

// Helper to fetch specialized profile data for a user
export async function getExpandedUserProfile(userId: string) {
  const userRes = await db.query(
    `SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.bio,
            u.role, u.account_type, u.is_banned, u.ban_reason, u.last_seen_at, u.created_at, u.updated_at
     FROM users u
     WHERE u.id = $1`,
    [userId]
  );

  if (userRes.rows.length === 0) return null;
  const user = userRes.rows[0] as any;

  // Check verification
  const verifRes = await db.query(
    `SELECT status, verification_type FROM account_verifications WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
    [userId]
  );
  const verification = verifRes.rows[0] as any;
  user.verification_status = verification?.status || 'UNVERIFIED';
  user.is_verified = verification?.status === 'VERIFIED';

  // Fetch account-type specific profile
  if (user.account_type === 'CREATOR') {
    const cp = await db.query(`SELECT * FROM creator_profiles WHERE user_id = $1`, [userId]);
    user.creator_profile = cp.rows[0] || null;
  } else if (user.account_type === 'BUSINESS') {
    const bp = await db.query(`SELECT * FROM business_profiles WHERE user_id = $1`, [userId]);
    user.business_profile = bp.rows[0] || null;
  } else if (user.account_type === 'PROFESSIONAL') {
    const pp = await db.query(`SELECT * FROM professional_profiles WHERE user_id = $1`, [userId]);
    user.professional_profile = pp.rows[0] || null;
  }

  return user;
}

// POST /api/profiles/switch-account-type
profilesRouter.post('/switch-account-type', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { account_type, metadata = {} } = req.body;

    if (!['PERSONAL', 'CREATOR', 'BUSINESS', 'PROFESSIONAL'].includes(account_type)) {
      return res.status(400).json({ error: 'Invalid account type' });
    }

    await db.query('BEGIN');
    try {
      await db.query(
        `UPDATE users SET account_type = $1, updated_at = NOW() WHERE id = $2`,
        [account_type, currentUserId]
      );

      // Ensure corresponding specialized profile exists
      if (account_type === 'CREATOR') {
        await db.query(
          `INSERT INTO creator_profiles (user_id, category, website_url, featured_content, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             category = COALESCE(EXCLUDED.category, creator_profiles.category),
             updated_at = NOW()`,
          [currentUserId, metadata.category || 'Digital Creator', metadata.website_url || null, metadata.featured_content || '']
        );
      } else if (account_type === 'BUSINESS') {
        await db.query(
          `INSERT INTO business_profiles (user_id, business_name, category, contact_email, address, opening_hours, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             business_name = COALESCE(EXCLUDED.business_name, business_profiles.business_name),
             updated_at = NOW()`,
          [
            currentUserId,
            metadata.business_name || req.user!.display_name,
            metadata.category || 'Company',
            metadata.contact_email || req.user!.email,
            metadata.address || null,
            metadata.opening_hours || 'Mon - Fri: 9:00 AM - 6:00 PM',
          ]
        );
      } else if (account_type === 'PROFESSIONAL') {
        await db.query(
          `INSERT INTO professional_profiles (user_id, profession_category, hourly_rate, experience_years, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             profession_category = COALESCE(EXCLUDED.profession_category, professional_profiles.profession_category),
             updated_at = NOW()`,
          [currentUserId, metadata.profession_category || 'Consultant', metadata.hourly_rate || '$75/hr', metadata.experience_years || 3]
        );
      }

      await db.query('COMMIT');

      await logAuditEvent(currentUserId, 'ACCOUNT_TYPE_SWITCHED', 'USER', currentUserId, { account_type }, req);

      const expanded = await getExpandedUserProfile(currentUserId);
      return res.json(expanded);
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  } catch (error: any) {
    console.error('[Switch Account Error]', error);
    return res.status(500).json({ error: 'Failed to switch account type' });
  }
});

// GET /api/profiles/creator/:userId
profilesRouter.get('/creator/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const resProfile = await db.query(
      `SELECT cp.*, u.username, u.display_name, u.avatar_url, u.bio,
              (SELECT status FROM account_verifications WHERE user_id = $1 AND verification_type = 'CREATOR') as verification_status
       FROM creator_profiles cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.user_id = $1`,
      [userId]
    );

    if (resProfile.rows.length === 0) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    return res.json(resProfile.rows[0]);
  } catch (error: any) {
    console.error('[Get Creator Profile Error]', error);
    return res.status(500).json({ error: 'Failed to get creator profile' });
  }
});

// PATCH /api/profiles/creator
profilesRouter.patch('/creator', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { category, website_url, social_links, featured_content, is_accepting_collaborations, cover_image_url } = req.body;

    await db.query(
      `INSERT INTO creator_profiles (user_id, category, website_url, social_links, featured_content, is_accepting_collaborations, cover_image_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         category = COALESCE(EXCLUDED.category, creator_profiles.category),
         website_url = EXCLUDED.website_url,
         social_links = COALESCE(EXCLUDED.social_links, creator_profiles.social_links),
         featured_content = EXCLUDED.featured_content,
         is_accepting_collaborations = COALESCE(EXCLUDED.is_accepting_collaborations, creator_profiles.is_accepting_collaborations),
         cover_image_url = EXCLUDED.cover_image_url,
         updated_at = NOW()`,
      [
        currentUserId,
        category || 'Digital Creator',
        website_url || null,
        JSON.stringify(social_links || {}),
        featured_content || '',
        is_accepting_collaborations ?? true,
        cover_image_url || null,
      ]
    );

    const cp = await db.query(`SELECT * FROM creator_profiles WHERE user_id = $1`, [currentUserId]);
    return res.json(cp.rows[0]);
  } catch (error: any) {
    console.error('[Update Creator Profile Error]', error);
    return res.status(500).json({ error: 'Failed to update creator profile' });
  }
});

// GET /api/profiles/business/:userId
profilesRouter.get('/business/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const resProfile = await db.query(
      `SELECT bp.*, u.username, u.display_name, u.avatar_url,
              (SELECT status FROM account_verifications WHERE user_id = $1 AND verification_type = 'BUSINESS') as verification_status
       FROM business_profiles bp
       JOIN users u ON bp.user_id = u.id
       WHERE bp.user_id = $1`,
      [userId]
    );

    if (resProfile.rows.length === 0) {
      return res.status(404).json({ error: 'Business profile not found' });
    }

    return res.json(resProfile.rows[0]);
  } catch (error: any) {
    console.error('[Get Business Profile Error]', error);
    return res.status(500).json({ error: 'Failed to get business profile' });
  }
});

// PATCH /api/profiles/business
profilesRouter.patch('/business', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const {
      business_name,
      category,
      description,
      website_url,
      contact_email,
      contact_phone,
      address,
      opening_hours,
      automated_welcome_message,
      automated_away_message,
      quick_replies,
      logo_url,
      cover_image_url,
    } = req.body;

    await db.query(
      `INSERT INTO business_profiles (
        user_id, business_name, category, description, website_url, contact_email,
        contact_phone, address, opening_hours, automated_welcome_message, automated_away_message,
        quick_replies, logo_url, cover_image_url, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        business_name = COALESCE(EXCLUDED.business_name, business_profiles.business_name),
        category = COALESCE(EXCLUDED.category, business_profiles.category),
        description = EXCLUDED.description,
        website_url = EXCLUDED.website_url,
        contact_email = EXCLUDED.contact_email,
        contact_phone = EXCLUDED.contact_phone,
        address = EXCLUDED.address,
        opening_hours = EXCLUDED.opening_hours,
        automated_welcome_message = EXCLUDED.automated_welcome_message,
        automated_away_message = EXCLUDED.automated_away_message,
        quick_replies = COALESCE(EXCLUDED.quick_replies, business_profiles.quick_replies),
        logo_url = EXCLUDED.logo_url,
        cover_image_url = EXCLUDED.cover_image_url,
        updated_at = NOW()`,
      [
        currentUserId,
        business_name || req.user!.display_name,
        category || 'Company',
        description || '',
        website_url || null,
        contact_email || req.user!.email,
        contact_phone || null,
        address || null,
        opening_hours || 'Mon - Fri: 9:00 AM - 6:00 PM',
        automated_welcome_message || 'Hello! Thank you for reaching out.',
        automated_away_message || 'We are currently offline.',
        JSON.stringify(quick_replies || []),
        logo_url || null,
        cover_image_url || null,
      ]
    );

    const bp = await db.query(`SELECT * FROM business_profiles WHERE user_id = $1`, [currentUserId]);
    return res.json(bp.rows[0]);
  } catch (error: any) {
    console.error('[Update Business Profile Error]', error);
    return res.status(500).json({ error: 'Failed to update business profile' });
  }
});

// GET /api/profiles/professional/:userId
profilesRouter.get('/professional/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const resProfile = await db.query(
      `SELECT pp.*, u.username, u.display_name, u.avatar_url, u.bio,
              (SELECT status FROM account_verifications WHERE user_id = $1 AND verification_type = 'PROFESSIONAL') as verification_status
       FROM professional_profiles pp
       JOIN users u ON pp.user_id = u.id
       WHERE pp.user_id = $1`,
      [userId]
    );

    if (resProfile.rows.length === 0) {
      return res.status(404).json({ error: 'Professional profile not found' });
    }

    return res.json(resProfile.rows[0]);
  } catch (error: any) {
    console.error('[Get Professional Profile Error]', error);
    return res.status(500).json({ error: 'Failed to get professional profile' });
  }
});

// PATCH /api/profiles/professional
profilesRouter.patch('/professional', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { profession_category, skills, experience_years, portfolio_items, services, hourly_rate, availability_status } = req.body;

    await db.query(
      `INSERT INTO professional_profiles (
        user_id, profession_category, skills, experience_years, portfolio_items,
        services, hourly_rate, availability_status, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        profession_category = COALESCE(EXCLUDED.profession_category, professional_profiles.profession_category),
        skills = COALESCE(EXCLUDED.skills, professional_profiles.skills),
        experience_years = COALESCE(EXCLUDED.experience_years, professional_profiles.experience_years),
        portfolio_items = COALESCE(EXCLUDED.portfolio_items, professional_profiles.portfolio_items),
        services = COALESCE(EXCLUDED.services, professional_profiles.services),
        hourly_rate = EXCLUDED.hourly_rate,
        availability_status = COALESCE(EXCLUDED.availability_status, professional_profiles.availability_status),
        updated_at = NOW()`,
      [
        currentUserId,
        profession_category || 'Consultant',
        JSON.stringify(skills || []),
        experience_years || 0,
        JSON.stringify(portfolio_items || []),
        JSON.stringify(services || []),
        hourly_rate || '$75/hr',
        availability_status || 'AVAILABLE',
      ]
    );

    const pp = await db.query(`SELECT * FROM professional_profiles WHERE user_id = $1`, [currentUserId]);
    return res.json(pp.rows[0]);
  } catch (error: any) {
    console.error('[Update Professional Profile Error]', error);
    return res.status(500).json({ error: 'Failed to update professional profile' });
  }
});

// BUSINESS STAFF MANAGEMENT

// GET /api/profiles/business/members
profilesRouter.get('/business-team/members', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const membersRes = await db.query(
      `SELECT bm.id, bm.business_user_id, bm.member_user_id, bm.role, bm.joined_at,
              u.username, u.display_name, u.email, u.avatar_url
       FROM business_members bm
       JOIN users u ON bm.member_user_id = u.id
       WHERE bm.business_user_id = $1
       ORDER BY bm.role = 'OWNER' DESC, bm.role = 'ADMIN' DESC, bm.joined_at ASC`,
      [currentUserId]
    );
    return res.json(membersRes.rows);
  } catch (error: any) {
    console.error('[Get Business Members Error]', error);
    return res.status(500).json({ error: 'Failed to get business members' });
  }
});

// POST /api/profiles/business/members
profilesRouter.post('/business-team/members', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { targetUserId, role = 'STAFF' } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    if (!['OWNER', 'ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
      return res.status(400).json({ error: 'Invalid staff role' });
    }

    const id = 'bm_' + crypto.randomUUID();
    await db.query(
      `INSERT INTO business_members (id, business_user_id, member_user_id, role, joined_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (business_user_id, member_user_id) DO UPDATE SET role = EXCLUDED.role`,
      [id, currentUserId, targetUserId, role]
    );

    return res.json({ success: true, message: 'Business team member updated.' });
  } catch (error: any) {
    console.error('[Add Business Member Error]', error);
    return res.status(500).json({ error: 'Failed to add business team member' });
  }
});

// DELETE /api/profiles/business/members/:targetUserId
profilesRouter.delete('/business-team/members/:targetUserId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { targetUserId } = req.params;

    await db.query(
      `DELETE FROM business_members WHERE business_user_id = $1 AND member_user_id = $2`,
      [currentUserId, targetUserId]
    );

    return res.json({ success: true, message: 'Member removed from business team.' });
  } catch (error: any) {
    console.error('[Remove Business Member Error]', error);
    return res.status(500).json({ error: 'Failed to remove member' });
  }
});

// VERIFICATION WORKFLOWS

// POST /api/profiles/verifications/request
profilesRouter.post('/verifications/request', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { verification_type, documents_info } = req.body;

    if (!['CREATOR', 'BUSINESS', 'PROFESSIONAL', 'EMAIL', 'PHONE'].includes(verification_type)) {
      return res.status(400).json({ error: 'Invalid verification type' });
    }

    const id = 'ver_' + crypto.randomUUID();
    await db.query(
      `INSERT INTO account_verifications (id, user_id, verification_type, status, documents_info, submitted_at)
       VALUES ($1, $2, $3, 'PENDING', $4, NOW())
       ON CONFLICT (user_id, verification_type) DO UPDATE SET
         status = 'PENDING',
         documents_info = EXCLUDED.documents_info,
         submitted_at = NOW(),
         rejection_reason = NULL`,
      [id, currentUserId, verification_type, documents_info || 'Standard verification application']
    );

    await logAuditEvent(currentUserId, 'VERIFICATION_REQUESTED', 'VERIFICATION', id, { verification_type }, req);

    return res.status(201).json({ success: true, message: 'Verification application submitted for review.' });
  } catch (error: any) {
    console.error('[Request Verification Error]', error);
    return res.status(500).json({ error: 'Failed to submit verification request' });
  }
});

// GET /api/profiles/verifications (Moderators & Admins)
profilesRouter.get('/verifications', requireAuth, requireRole('MODERATOR', 'ADMIN', 'SUPER_ADMIN'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const listRes = await db.query(
      `SELECT v.*, u.username, u.display_name, u.email, u.avatar_url, u.account_type
       FROM account_verifications v
       JOIN users u ON v.user_id = u.id
       ORDER BY v.submitted_at DESC`
    );
    return res.json(listRes.rows);
  } catch (error: any) {
    console.error('[List Verifications Error]', error);
    return res.status(500).json({ error: 'Failed to list verifications' });
  }
});

// PATCH /api/profiles/verifications/:id (Review verification)
profilesRouter.patch('/verifications/:id', requireAuth, requireRole('MODERATOR', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;
    const currentUserId = req.user!.id;

    if (!['VERIFIED', 'REJECTED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: 'Invalid verification status' });
    }

    const updated = await db.query(
      `UPDATE account_verifications
       SET status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, rejection_reason || null, currentUserId, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    await logAuditEvent(currentUserId, 'VERIFICATION_REVIEWED', 'VERIFICATION', id, { status, rejection_reason }, req);

    return res.json(updated.rows[0]);
  } catch (error: any) {
    console.error('[Review Verification Error]', error);
    return res.status(500).json({ error: 'Failed to review verification' });
  }
});
