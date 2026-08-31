import { Router } from 'express';
import { accountController } from '../controllers/accountController.js';
import { authRequired } from '../middleware/auth.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();

/* Semua butuh login. Foto tidak butuh verifikasi email; perubahan lain wajib. */
router.post('/photo', authRequired, requireVerified, wrap(accountController.updatePhoto));
router.post('/change/request', authRequired, requireVerified, rateLimit({ name: 'acct-change', windowMs: 15 * 60 * 1000, max: 12 }), wrap(accountController.requestChange));
router.post('/change/confirm', authRequired, requireVerified, wrap(accountController.confirmChange));

export default router;
