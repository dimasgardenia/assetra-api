/* Express app setup — middleware, static, routes, error handler. */
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env } from './config/env.js';
import { initSchema } from './db/init.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authOptional } from './middleware/auth.js';

import authRoutes from './routes/auth.routes.js';
import listingsRoutes from './routes/listings.routes.js';
import bidsRoutes from './routes/bids.routes.js';
import watchlistRoutes from './routes/watchlist.routes.js';
import adminRoutes from './routes/admin.routes.js';
import aiRoutes from './routes/ai.routes.js';
import bannersRoutes from './routes/banners.routes.js';
import kprRoutes from './routes/kpr.routes.js';
import agentsRoutes from './routes/agents.routes.js';
import leadsRoutes from './routes/leads.routes.js';
import contactRoutes from './routes/contact.routes.js';
import accountRoutes from './routes/account.routes.js';

initSchema();

export const app = express();

app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(authOptional);

/* Static file serving — uploaded photos/docs accessible at /files/photos/... and /files/docs/... */
app.use('/files', express.static(path.resolve(env.UPLOAD_DIR)));

/* Health check */
app.get('/api/health', (req, res) => res.json({ ok: true, version: '0.1.0' }));

/* Mount routes */
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/bids', bidsRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/banners', bannersRoutes);
app.use('/api/kpr', kprRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/account', accountRoutes);

/* API 404 before the SPA fallback so unknown API paths never return index.html */
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Not found' }));

/* Optional: serve the built frontend from the same origin (WEB_DIST=/path/to/dist).
   Any non-API, non-file GET falls back to index.html for client-side routing. */
if (env.WEB_DIST) {
  const webDir = path.resolve(env.WEB_DIST);
  const indexHtml = path.join(webDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(webDir, { index: 'index.html' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/files/')) return next();
      res.sendFile(indexHtml);
    });
    console.log(`[assetra-api] serving frontend from ${webDir}`);
  } else {
    console.warn(`[assetra-api] WEB_DIST set but ${indexHtml} not found — frontend not served`);
  }
}

app.use(errorHandler);
