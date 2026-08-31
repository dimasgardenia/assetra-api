import { Router } from 'express';
import { kprController } from '../controllers/kprController.js';
import { authRequired } from '../middleware/auth.js';
import { requireStaff } from '../middleware/requireStaff.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();

/* Submit publik dibatasi agar tidak di-spam. */
router.post('/', rateLimit({ name: 'kpr-submit', windowMs: 15 * 60 * 1000, max: 8 }), wrap(kprController.submit));

/* Staf panel (admin atau agen terverifikasi) */
router.get('/', authRequired, requireStaff, wrap(kprController.list));
router.post('/:id/status', authRequired, requireStaff, wrap(kprController.setStatus));

export default router;
