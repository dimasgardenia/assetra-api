import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { listingController } from '../controllers/listingController.js';
import { bidController } from '../controllers/bidController.js';
import { uploadController } from '../controllers/uploadController.js';
import { authRequired } from '../middleware/auth.js';
import { requireStaff } from '../middleware/requireStaff.js';
import { ListingModel } from '../models/Listing.js';

/* Admin boleh mengelola semua listing; agen (terverifikasi, via requireStaff)
   hanya listing yang ia buat sendiri. Dipakai setelah authRequired + requireStaff. */
function requireListingOwner(req, res, next) {
  if (req.user.role === 'admin') return next();
  const listing = ListingModel.findById(decodeURIComponent(req.params.id));
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.createdBy !== req.user.id) {
    return res.status(403).json({ error: 'Anda hanya bisa mengelola listing yang Anda buat sendiri' });
  }
  next();
}
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
router.post('/',    authRequired, requireStaff, wrap(listingController.create));
router.put('/:id',  authRequired, requireStaff, requireListingOwner, wrap(listingController.update));
router.delete('/:id', authRequired, requireStaff, requireListingOwner, wrap(listingController.remove));

/* Bids — list public, place requires auth */
router.get('/:id/bids',  wrap(bidController.listForListing));
router.post('/:id/bids', authRequired, wrap(bidController.place));

/* Photos — admin, atau agen untuk listing miliknya */
router.post('/:id/photos',
  authRequired, requireStaff, requireListingOwner,
  uploadPhotos.array('photos', 24),
  wrap(uploadController.addPhotos));

router.delete('/:id/photos/:photoId',
  authRequired, requireStaff, requireListingOwner,
  wrap(uploadController.removePhoto));

router.post('/:id/photos/reorder',
  authRequired, requireStaff, requireListingOwner,
  wrap(uploadController.reorderPhotos));

/* Documents — admin, atau agen untuk listing miliknya */
router.post('/:id/documents/:slot',
  authRequired, requireStaff, requireListingOwner,
  uploadDoc.single('file'),
  wrap(uploadController.uploadDocument));

router.delete('/:id/documents/:slot',
  authRequired, requireStaff, requireListingOwner,
  wrap(uploadController.removeDocument));

export default router;
