import { Router } from 'express';
import { leadController } from '../controllers/leadController.js';
import { authRequired } from '../middleware/auth.js';
import { requireStaff } from '../middleware/requireStaff.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();

/* Publik — tangkap prospek dari tombol kontak (dibatasi agar tidak di-spam). */
router.post('/', rateLimit({ name: 'lead-capture', windowMs: 60 * 1000, max: 30 }), wrap(leadController.capture));

/* Staf panel (admin atau agen terverifikasi) */
router.get('/', authRequired, requireStaff, wrap(leadController.list));
router.post('/:id/status', authRequired, requireStaff, wrap(leadController.setStatus));

export default router;
