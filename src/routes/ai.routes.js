import { Router } from 'express';
import { aiController } from '../controllers/aiController.js';
import { authRequired } from '../middleware/auth.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();
/* Fitur AI hanya untuk pengguna yang sudah login DAN terverifikasi email. */
router.post('/chat', authRequired, requireVerified, wrap(aiController.chat));
export default router;
