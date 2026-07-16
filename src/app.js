/* Express app setup — middleware, static, routes, error handler. */
import express from 'express';
import cors from 'cors';
import path from 'path';
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

/* 404 + error handler last */
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);
