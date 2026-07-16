import { Router } from 'express';
import { aiController } from '../controllers/aiController.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();
router.post('/chat', wrap(aiController.chat));
export default router;
