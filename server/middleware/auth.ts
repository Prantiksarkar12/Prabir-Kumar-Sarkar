import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    display_name: string;
    email: string;
    avatar_url: string | null;
    bio: string | null;
    role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
    is_banned: boolean;
    ban_reason: string | null;
    session_id: string;
    token: string;
  };
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.cookies && req.cookies.pulse_session) {
      token = req.cookies.pulse_session;
    } else if (req.headers['x-session-token']) {
      token = req.headers['x-session-token'] as string;
    }

    if (!token) {
      return next();
    }

    const sessionRes = await db.query(
      `SELECT s.id as session_id, s.token, s.expires_at,
              u.id, u.username, u.display_name, u.email, u.avatar_url, u.bio,
              u.role, u.is_banned, u.ban_reason
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = $1`,
      [token]
    );

    if (sessionRes.rows.length === 0) {
      return next();
    }

    const session = sessionRes.rows[0] as any;
    if (new Date(session.expires_at) < new Date()) {
      return next();
    }

    if (session.is_banned) {
      return res.status(403).json({
        error: `Account suspended: ${session.ban_reason || 'Violation of terms'}`,
        is_banned: true,
      });
    }

    req.user = {
      id: session.id,
      username: session.username,
      display_name: session.display_name,
      email: session.email,
      avatar_url: session.avatar_url,
      bio: session.bio,
      role: session.role,
      is_banned: session.is_banned,
      ban_reason: session.ban_reason,
      session_id: session.session_id,
      token: session.token,
    };

    next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    next();
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireRole(...allowedRoles: Array<'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const roleHierarchy: Record<string, number> = {
      USER: 1,
      MODERATOR: 2,
      ADMIN: 3,
      SUPER_ADMIN: 4,
    };

    const minRequiredLevel = Math.min(...allowedRoles.map((r) => roleHierarchy[r] || 1));
    const userLevel = roleHierarchy[req.user.role] || 1;

    if (userLevel < minRequiredLevel) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

export async function logAuditEvent(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: any,
  req?: Request
) {
  try {
    const id = 'aud_' + crypto.randomUUID();
    const ip = req?.ip || req?.socket.remoteAddress || '127.0.0.1';
    const userAgent = req?.headers['user-agent'] || 'internal';

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [id, actorId, action, targetType, targetId, JSON.stringify(metadata || {}), ip, userAgent]
    );
  } catch (err) {
    console.error('[Audit Log] Failed to record audit log:', err);
  }
}
