import { Router } from 'express';
import { statsController } from '../controllers/statsController.js';
import { kycController } from '../controllers/kycController.js';
import { uploadController } from '../controllers/uploadController.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

router.get('/stats',          wrap(statsController.dashboard));
router.get('/kyc',            wrap(kycController.listAll));
router.get('/kyc/pending',    wrap(kycController.listPending));
router.post('/kyc/:id/approve', wrap(kycController.approve));
router.post('/kyc/:id/reject',  wrap(kycController.reject));
router.get('/documents',      wrap(uploadController.listAllDocuments));

export default router;
