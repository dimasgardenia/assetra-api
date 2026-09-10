import { KycModel } from '../models/Kyc.js';
import { UserModel } from '../models/User.js';

export const kycController = {
  async listPending(req, res) {
    res.json({ data: KycModel.listByStatus('pending') });
  },

  async listAll(req, res) {
    res.json({ data: KycModel.listAll() });
  },

  /** Pengguna terverifikasi email mengajukan KYC (satu pengajuan tertunda per akun). */
  async submit(req, res) {
    if (req.user.kycVerified) return res.status(409).json({ error: 'Akun Anda sudah terverifikasi KYC' });
    if (KycModel.findPendingByUser(req.user.id)) return res.status(409).json({ error: 'Pengajuan KYC Anda masih menunggu tinjauan' });
    const submission = KycModel.create({ userId: req.user.id, notes: req.body?.notes ? String(req.body.notes).slice(0, 500) : null });
    res.status(201).json({ data: submission });
  },

  /** Status KYC milik pengguna yang login. */
  async mine(req, res) {
    res.json({ data: { kycVerified: !!req.user.kycVerified, latest: KycModel.findLatestByUser(req.user.id) || null } });
  },

  async approve(req, res) {
    const id = Number(req.params.id);
    const k = KycModel.findById(id);
    if (!k) return res.status(404).json({ error: 'KYC submission not found' });
    UserModel.updateProfile(k.userId, { kycVerified: true });
    const updated = KycModel.setStatus(id, 'approved', req.user.id);
    res.json({ data: updated });
  },

  async reject(req, res) {
    const id = Number(req.params.id);
    const k = KycModel.findById(id);
    if (!k) return res.status(404).json({ error: 'KYC submission not found' });
    /* Menolak juga mencabut status terverifikasi (mis. setelah sebelumnya disetujui). */
    UserModel.updateProfile(k.userId, { kycVerified: false });
    const updated = KycModel.setStatus(id, 'rejected', req.user.id);
    res.json({ data: updated });
  },
};
