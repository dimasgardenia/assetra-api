import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { bannerController } from '../controllers/bannerController.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();

const BANNER_DIR = path.resolve(env.UPLOAD_DIR, 'banners');
fs.mkdirSync(BANNER_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, BANNER_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/active', wrap(bannerController.active));
router.post('/:id/click', wrap(bannerController.click));

router.get('/', authRequired, requireRole('admin'), wrap(bannerController.list));
router.post('/', authRequired, requireRole('admin'), upload.single('image'), wrap(bannerController.create));
router.delete('/:id', authRequired, requireRole('admin'), wrap(bannerController.remove));

export default router;
