import { Router } from 'express';
import { bidController } from '../controllers/bidController.js';
import { authRequired } from '../middleware/auth.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();
router.get('/mine', authRequired, wrap(bidController.listMine));
export default router;
