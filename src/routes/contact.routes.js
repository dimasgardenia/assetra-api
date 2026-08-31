import { Router } from 'express';
import { contactController } from '../controllers/contactController.js';
import { authRequired } from '../middleware/auth.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();

/* Wajib login DAN terverifikasi — nomor kontak tidak dikirim ke tamu
   maupun akun yang belum verifikasi email. */
router.get('/', authRequired, requireVerified, wrap(contactController.get));

export default router;
