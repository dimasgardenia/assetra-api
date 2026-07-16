import { KycModel } from '../models/Kyc.js';
import { UserModel } from '../models/User.js';

export const kycController = {
  async listPending(req, res) {
    res.json({ data: KycModel.listByStatus('pending') });
  },

  async listAll(req, res) {
    res.json({ data: KycModel.listAll() });
  },

  async submit(req, res) {
    const submission = KycModel.create({ userId: req.user.id, notes: req.body?.notes || null });
    res.status(201).json({ data: submission });
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
    const updated = KycModel.setStatus(id, 'rejected', req.user.id);
    res.json({ data: updated });
  },
};
