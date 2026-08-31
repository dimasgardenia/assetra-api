/* Pengajuan KPR: submit publik dari halaman Financing → daftar & ubah status di admin. */
import { KprApplicationModel } from '../models/KprApplication.js';
import { normalizeIndoPhone } from '../utils/phone.js';

const VALID_STATUS = ['submitted', 'review', 'approved', 'rejected'];

export const kprController = {
  /** Publik — kirim pengajuan/pra-persetujuan KPR. */
  async submit(req, res) {
    const { name, phone, email, income, bank, propertyPrice, loanAmount, downPayment, tenorYears, rate } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nama wajib diisi' });
    const normPhone = normalizeIndoPhone(phone || '');
    if (!normPhone) return res.status(400).json({ error: 'Nomor WhatsApp tidak valid — gunakan format 08xx / +62xx' });

    const app = KprApplicationModel.create({
      name: String(name).trim(),
      phone: normPhone,
      email: email || null,
      income: income ? Number(income) : null,
      bank: bank || 'Semua bank',
      propertyPrice: propertyPrice != null ? Number(propertyPrice) : null,
      loanAmount: loanAmount != null ? Number(loanAmount) : null,
      downPayment: downPayment != null ? Number(downPayment) : null,
      tenorYears: tenorYears != null ? Number(tenorYears) : null,
      rate: rate != null ? Number(rate) : null,
    });
    console.log(`[kpr] pengajuan baru: ${app.name} (${app.phone}) → ${app.bank}`);
    return res.status(201).json({ data: app });
  },

  /** Admin — daftar semua pengajuan. */
  async list(req, res) {
    res.json({ data: KprApplicationModel.listAll() });
  },

  /** Admin — ubah status. */
  async setStatus(req, res) {
    const { status } = req.body || {};
    if (!VALID_STATUS.includes(status)) return res.status(400).json({ error: `status harus salah satu: ${VALID_STATUS.join(', ')}` });
    const app = KprApplicationModel.updateStatus(Number(req.params.id), status);
    if (!app) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    res.json({ data: app });
  },
};
