import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { env, isProduction } from './config/env';
import { initDb } from './db/sqlite';
import { errorHandler } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';
import { startDownloadSweeper } from './services/download.service';

import videoRouter from './routes/video.routes';
import downloadRouter from './routes/download.routes';
import chatRouter from './routes/chat.routes';
import instagramRouter from './routes/instagram.routes';

const app = express();
app.disable('x-powered-by');
if (env.TRUST_PROXY) app.set('trust proxy', 1); // behind Render / Railway / Nginx

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(
  '/api',
  cors({
    origin: env.CORS_ORIGIN.includes('*') ? true : env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Content-Disposition'],
  })
);
app.use(express.json({ limit: '50kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Lightweight polling endpoints (status / download progress) don't count toward the global budget.
const isPoll = (req: express.Request) =>
  req.method === 'GET' && (/^\/videos\/[^/]+\/status$/.test(req.path) || /^\/downloads\/[^/]+$/.test(req.path));
app.use('/api', rateLimit({ name: 'global', windowMs: 60_000, max: env.RATE_LIMIT_PER_MINUTE, skip: isPoll }));
app.use('/api/videos', videoRouter);
app.use('/api/downloads', downloadRouter);
app.use('/api/chat', chatRouter);
app.use('/api/instagram', instagramRouter);
app.use('/api', (_req, res) => res.status(404).json({ success: false, error: 'Not found' }));

// In production, serve the built React app from the same origin (no CORS needed).
if (fs.existsSync(path.join(env.CLIENT_DIST_DIR, 'index.html'))) {
  app.use(express.static(env.CLIENT_DIST_DIR, { index: false, maxAge: isProduction ? '1h' : 0 }));
  app.get('*', (_req, res) => res.sendFile(path.join(env.CLIENT_DIST_DIR, 'index.html')));
}

app.use(errorHandler);

async function startServer() {
  try {
    await initDb();
    startDownloadSweeper();
    app.listen(env.PORT, () => {
      console.log(`🚀 VidMind AI server on http://localhost:${env.PORT} (${env.NODE_ENV})`);
      if (!env.NVIDIA_API_KEY) console.warn('⚠️  NVIDIA_API_KEY is not set — AI features will be unavailable.');
    });
  } catch (error) {
    console.error('Failed to start VidMind AI server:', error);
    process.exit(1);
  }
}

startServer();
