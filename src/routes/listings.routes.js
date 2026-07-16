import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { listingController } from '../controllers/listingController.js';
import { bidController } from '../controllers/bidController.js';
import { uploadController } from '../controllers/uploadController.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();

const PHOTO_DIR = path.resolve(env.UPLOAD_DIR, 'photos');
const DOC_DIR = path.resolve(env.UPLOAD_DIR, 'docs');
fs.mkdirSync(PHOTO_DIR, { recursive: true });
fs.mkdirSync(DOC_DIR, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PHOTO_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOC_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const uploadPhotos = multer({ storage: photoStorage, limits: { fileSize: 15 * 1024 * 1024 } });
const uploadDoc    = multer({ storage: docStorage,   limits: { fileSize: 30 * 1024 * 1024 } });

/* Listings CRUD — list/get are public; create/update/delete require admin. */
router.get('/',     wrap(listingController.list));
router.get('/:id',  wrap(listingController.get));
router.post('/',    authRequired, requireRole('admin'), wrap(listingController.create));
router.put('/:id',  authRequired, requireRole('admin'), wrap(listingController.update));
router.delete('/:id', authRequired, requireRole('admin'), wrap(listingController.remove));

/* Bids — list public, place requires auth */
router.get('/:id/bids',  wrap(bidController.listForListing));
router.post('/:id/bids', authRequired, wrap(bidController.place));

/* Photos — admin only */
router.post('/:id/photos',
  authRequired, requireRole('admin'),
  uploadPhotos.array('photos', 24),
  wrap(uploadController.addPhotos));

router.delete('/:id/photos/:photoId',
  authRequired, requireRole('admin'),
  wrap(uploadController.removePhoto));

router.post('/:id/photos/reorder',
  authRequired, requireRole('admin'),
  wrap(uploadController.reorderPhotos));

/* Documents — admin only */
router.post('/:id/documents/:slot',
  authRequired, requireRole('admin'),
  uploadDoc.single('file'),
  wrap(uploadController.uploadDocument));

router.delete('/:id/documents/:slot',
  authRequired, requireRole('admin'),
  wrap(uploadController.removeDocument));

export default router;
