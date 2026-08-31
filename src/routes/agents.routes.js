import { Router } from 'express';
import { agentController } from '../controllers/agentController.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireStaff } from '../middleware/requireStaff.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();

/* Publik — dipakai kartu agen di halaman Detail (foto + info ringkas). */
router.get('/', wrap(agentController.listPublic));

/* Publik — pendaftaran mandiri agen (dibatasi agar tidak di-spam). */
router.post('/apply', rateLimit({ name: 'agent-apply', windowMs: 15 * 60 * 1000, max: 6 }), wrap(agentController.apply));

/* Status kartu agen milik user yang login (untuk cek "agent terverifikasi"). */
router.get('/me', authRequired, wrap(agentController.me));

/* Staf panel bisa melihat daftar agen; kelola (buat/ubah/hapus) hanya admin. */
router.get('/manage', authRequired, requireStaff, wrap(agentController.list));
router.post('/', authRequired, requireRole('admin'), wrap(agentController.create));
router.put('/:id', authRequired, requireRole('admin'), wrap(agentController.update));
router.delete('/:id', authRequired, requireRole('admin'), wrap(agentController.remove));

export default router;
