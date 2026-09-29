import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, logAuditEvent } from '../middleware/auth';
import { getExpandedUserProfile } from './profiles';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, display_name, email, password, account_type = 'PERSONAL', profile_meta = {} } = req.body;

    if (!username || !display_name || !email || !password) {
      return res.status(400).json({ error: 'All fields (username, display_name, email, password) are required.' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanDisplayName = String(display_name).trim();
    const cleanAccountType = ['PERSONAL', 'CREATOR', 'BUSINESS', 'PROFESSIONAL'].includes(account_type)
      ? account_type
      : 'PERSONAL';

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be 3-24 characters and only contain letters, numbers, and underscores.' });
    }

    if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    // Check duplicate
    const existing = await db.query(
      `SELECT id, username, email FROM users WHERE username = $1 OR email = $2`,
      [cleanUsername, cleanEmail]
    );

    if (existing.rows.length > 0) {
      const match = existing.rows[0] as any;
      if (match.username === cleanUsername) {
        return res.status(409).json({ error: 'Username is already taken.' });
      }
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    // Check if this is the very first user created on the platform
    const userCountRes = await db.query(`SELECT COUNT(*) as count FROM users`);
    const isFirstUser = parseInt((userCountRes.rows[0] as any).count, 10) === 0;
    const initialRole = isFirstUser ? 'SUPER_ADMIN' : 'USER';

    const userId = 'usr_' + crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`;

    // Transaction: Create user + Create privacy settings + Create specialized profile
    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO users (id, username, display_name, email, password_hash, avatar_url, role, account_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [userId, cleanUsername, cleanDisplayName, cleanEmail, passwordHash, defaultAvatar, initialRole, cleanAccountType]
      );

      await db.query(
        `INSERT INTO user_privacy_settings (user_id, who_can_message, who_can_see_online, who_can_see_last_seen, who_can_add_to_groups, read_receipts_enabled, push_notifications_enabled, created_at, updated_at)
         VALUES ($1, 'EVERYONE', 'EVERYONE', 'EVERYONE', 'EVERYONE', TRUE, TRUE, NOW(), NOW())`,
        [userId]
      );

      // Initialize account type profile
      if (cleanAccountType === 'CREATOR') {
        await db.query(
          `INSERT INTO creator_profiles (user_id, category, website_url, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())`,
          [userId, profile_meta.category || 'Digital Creator', profile_meta.website_url || null]
        );
      } else if (cleanAccountType === 'BUSINESS') {
        await db.query(
          `INSERT INTO business_profiles (user_id, business_name, category, contact_email, address, opening_hours, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [
            userId,
            profile_meta.business_name || cleanDisplayName,
            profile_meta.category || 'Organization',
            cleanEmail,
            profile_meta.address || null,
            profile_meta.opening_hours || 'Mon - Fri: 9:00 AM - 6:00 PM',
          ]
        );
      } else if (cleanAccountType === 'PROFESSIONAL') {
        await db.query(
          `INSERT INTO professional_profiles (user_id, profession_category, hourly_rate, experience_years, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [
            userId,
            profile_meta.profession_category || 'Consultant',
            profile_meta.hourly_rate || '$75/hr',
            profile_meta.experience_years || 3,
          ]
        );
      }

      // Create session
      const sessionId = 'ses_' + crypto.randomUUID();
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const deviceInfo = req.headers['user-agent'] || 'Web Browser';
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

      await db.query(
        `INSERT INTO sessions (id, user_id, token, device_info, ip_address, expires_at, created_at, last_active_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [sessionId, userId, sessionToken, deviceInfo, ip, expiresAt.toISOString()]
      );

      await db.query('COMMIT');

      // Set cookie
      res.cookie('pulse_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      await logAuditEvent(userId, 'USER_REGISTERED', 'USER', userId, { username: cleanUsername, role: initialRole, account_type: cleanAccountType }, req);

      const expanded = await getExpandedUserProfile(userId);

      return res.status(201).json({
        user: expanded,
        token: sessionToken,
      });
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  } catch (error: any) {
    console.error('[Register Error]', error);
    return res.status(500).json({ error: error.message || 'Registration failed.' });
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/Email and password are required.' });
    }

    const cleanIdentifier = String(identifier).trim().toLowerCase();

    const userRes = await db.query(
      `SELECT id, username, display_name, email, password_hash, avatar_url, bio, role, is_banned, ban_reason, last_seen_at, created_at, updated_at
       FROM users
       WHERE username = $1 OR email = $1`,
      [cleanIdentifier]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials. User not found.' });
    }

    const user = userRes.rows[0] as any;

    if (user.is_banned) {
      return res.status(403).json({
        error: `Your account has been suspended: ${user.ban_reason || 'Violation of community guidelines'}`,
        is_banned: true,
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials. Incorrect password.' });
    }

    // Create session
    const sessionId = 'ses_' + crypto.randomUUID();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const deviceInfo = req.headers['user-agent'] || 'Web Browser';
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

    await db.query(
      `INSERT INTO sessions (id, user_id, token, device_info, ip_address, expires_at, created_at, last_active_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [sessionId, user.id, sessionToken, deviceInfo, ip, expiresAt.toISOString()]
    );

    // Set cookie
    res.cookie('pulse_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    await logAuditEvent(user.id, 'USER_LOGIN', 'USER', user.id, { ip, deviceInfo }, req);

    const expanded = await getExpandedUserProfile(user.id);

    return res.json({
      user: expanded,
      token: sessionToken,
    });
  } catch (error: any) {
    console.error('[Login Error]', error);
    return res.status(500).json({ error: error.message || 'Login failed.' });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.session_id) {
      await db.query(`DELETE FROM sessions WHERE id = $1`, [req.user.session_id]);
    }
    res.clearCookie('pulse_session');
    return res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error: any) {
    console.error('[Logout Error]', error);
    return res.status(500).json({ error: 'Logout failed.' });
  }
});

// GET /api/auth/session
authRouter.get('/session', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const expanded = await getExpandedUserProfile(req.user!.id);
    if (!expanded) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const privacyRes = await db.query(
      `SELECT who_can_message, who_can_see_online, who_can_see_last_seen, who_can_add_to_groups, read_receipts_enabled, push_notifications_enabled
       FROM user_privacy_settings
       WHERE user_id = $1`,
      [req.user!.id]
    );

    const priv = (privacyRes.rows[0] as any) || {};

    return res.json({
      user: expanded,
      privacy: {
        who_can_message: priv.who_can_message || 'EVERYONE',
        who_can_see_online: priv.who_can_see_online || 'EVERYONE',
        who_can_see_last_seen: priv.who_can_see_last_seen || 'EVERYONE',
        who_can_add_to_groups: priv.who_can_add_to_groups || 'EVERYONE',
        read_receipts_enabled: priv.read_receipts_enabled ?? true,
        push_notifications_enabled: priv.push_notifications_enabled ?? true,
      },
      token: req.user!.token,
    });
  } catch (error: any) {
    console.error('[Session Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve session.' });
  }
});

// POST /api/auth/password/change
authRouter.post('/password/change', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    const userRes = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [req.user!.id]);
    const isValid = await bcrypt.compare(currentPassword, (userRes.rows[0] as any).password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newHash, req.user!.id]);

    // Invalidate all other sessions except current
    await db.query(`DELETE FROM sessions WHERE user_id = $1 AND id != $2`, [req.user!.id, req.user!.session_id]);

    await logAuditEvent(req.user!.id, 'PASSWORD_CHANGED', 'USER', req.user!.id, {}, req);

    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error: any) {
    console.error('[Password Change Error]', error);
    return res.status(500).json({ error: 'Failed to change password.' });
  }
});

// POST /api/auth/delete-account
authRouter.post('/delete-account', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password confirmation is required to delete account.' });
    }

    const userRes = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [req.user!.id]);
    const isValid = await bcrypt.compare(password, (userRes.rows[0] as any).password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Incorrect password.' });
    }

    await logAuditEvent(req.user!.id, 'ACCOUNT_DELETED', 'USER', req.user!.id, { username: req.user!.username }, req);

    // Delete user (cascades to sessions, privacy settings, etc.)
    await db.query(`DELETE FROM users WHERE id = $1`, [req.user!.id]);

    res.clearCookie('pulse_session');
    return res.json({ success: true, message: 'Account permanently deleted.' });
  } catch (error: any) {
    console.error('[Delete Account Error]', error);
    return res.status(500).json({ error: 'Failed to delete account.' });
  }
});
