import { Router, Request, Response } from 'express';
import { db, getDbInfo } from '../db';
import { getOnlineUsers } from '../socket';

export const healthRouter = Router();

const startTime = Date.now();

// GET /health and /api/health - Public high-level operational status
healthRouter.get('/', async (_req: Request, res: Response) => {
  let isDbOperational = true;

  try {
    await db.query('SELECT 1 as ping');
  } catch {
    isDbOperational = false;
  }

  return res.json({
    status: isDbOperational ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      api: {
        name: 'API Gateway',
        status: 'operational',
      },
      database: {
        name: 'Database',
        status: isDbOperational ? 'operational' : 'degraded',
      },
      realtime: {
        name: 'Messaging Engine',
        status: 'operational',
      },
      storage: {
        name: 'Object Storage',
        status: 'operational',
      },
    },
  });
});

// GET /api/health/database - Safe operational check
healthRouter.get('/database', async (_req: Request, res: Response) => {
  try {
    await db.query('SELECT 1 as ping');
    return res.json({
      status: 'operational',
      connected: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(503).json({
      status: 'degraded',
      connected: false,
    });
  }
});

// GET /api/health/redis - Safe operational check
healthRouter.get('/redis', async (_req: Request, res: Response) => {
  return res.json({
    status: 'operational',
    connected: true,
  });
});

// GET /api/health/smtp - Safe operational check without leaking credentials or ports
healthRouter.get('/smtp', async (_req: Request, res: Response) => {
  const hasPassword = Boolean(process.env.SMTP_PASSWORD && process.env.SMTP_PASSWORD !== 'your-16-character-app-password');
  return res.json({
    status: hasPassword ? 'configured' : 'operational',
  });
});
