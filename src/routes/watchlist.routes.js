import { Router } from 'express';
import { watchlistController } from '../controllers/watchlistController.js';
import { authRequired } from '../middleware/auth.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();

router.use(authRequired);
router.get('/',         wrap(watchlistController.list));
router.post('/:id',     wrap(watchlistController.add));
router.delete('/:id',   wrap(watchlistController.remove));

export default router;
