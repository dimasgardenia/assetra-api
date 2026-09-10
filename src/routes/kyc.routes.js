import { Router } from 'express';
import { kycController } from '../controllers/kycController.js';
import { authRequired } from '../middleware/auth.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();

/* Pengguna: ajukan KYC & lihat status pengajuannya. Tinjauan ada di /api/admin/kyc. */
router.post('/', authRequired, requireVerified, rateLimit({ name: 'kyc-submit', windowMs: 15 * 60 * 1000, max: 5 }), wrap(kycController.submit));
router.get('/me', authRequired, wrap(kycController.mine));

export default router;
