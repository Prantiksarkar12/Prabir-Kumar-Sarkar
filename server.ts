import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';

import { initDatabase } from './server/db';
import { initSocket } from './server/socket';
import { authenticate } from './server/middleware/auth';

import { authRouter } from './server/routes/auth';
import { usersRouter } from './server/routes/users';
import { conversationsRouter } from './server/routes/conversations';
import { messagesRouter } from './server/routes/messages';
import { uploadsRouter } from './server/routes/uploads';
import { reportsRouter } from './server/routes/reports';
import { adminRouter } from './server/routes/admin';
import { healthRouter } from './server/routes/health';
import { profilesRouter } from './server/routes/profiles';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Security & parsing middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Static uploads directory
  const uploadsDir = path.resolve(__dirname, 'data/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // Global auth populator
  app.use(authenticate as any);

  // Root /health endpoint for production monitoring & landing page status
  app.use('/health', healthRouter);

  // Mount API routers under both /api and /api/v1 for standard production API versioning
  const apiPrefixes = ['/api', '/api/v1'];
  for (const prefix of apiPrefixes) {
    app.use(`${prefix}/health`, healthRouter);
    app.use(`${prefix}/auth`, authRouter);
    app.use(`${prefix}/users`, usersRouter);
    app.use(`${prefix}/conversations`, conversationsRouter);
    app.use(`${prefix}`, messagesRouter);
    app.use(`${prefix}/uploads`, uploadsRouter);
    app.use(`${prefix}/reports`, reportsRouter);
    app.use(`${prefix}/admin`, adminRouter);
    app.use(`${prefix}/profiles`, profilesRouter);
  }

  // Initialize DB and Socket.IO
  await initDatabase();
  initSocket(httpServer);

  // Vite middleware in dev or static files in production
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const HOST = process.env.HOST || '0.0.0.0';
  httpServer.listen(PORT, HOST, () => {
    console.log(`[Pulse Server] Running on http://${HOST}:${PORT} (env: ${process.env.NODE_ENV || 'dev'})`);
  });
}

startServer().catch((err) => {
  console.error('[Pulse Server] Fatal startup error:', err);
  process.exit(1);
});
