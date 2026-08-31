/* Prospek: tertangkap otomatis dari tombol kontak (publik) → dikelola di menu Prospek admin. */
import { LeadModel } from '../models/Lead.js';
import { normalizeIndoPhone } from '../utils/phone.js';

const VALID_TYPE = ['whatsapp', 'call', 'survey', 'ai'];
const VALID_STATUS = ['new', 'contacted', 'closed'];

export const leadController = {
  /** Publik — catat ketertarikan saat pengguna klik kontak agen. */
  async capture(req, res) {
    const { name, phone, listingId, listingTitle, type, message } = req.body || {};
    const lead = LeadModel.create({
      name: name ? String(name).trim() : (req.user?.name || null),
      phone: phone ? (normalizeIndoPhone(phone) || String(phone).trim()) : null,
      listingId,
      listingTitle: listingTitle ? String(listingTitle).slice(0, 200) : null,
      type: VALID_TYPE.includes(type) ? type : 'whatsapp',
      message: message ? String(message).slice(0, 500) : null,
    });
    return res.status(201).json({ data: { id: lead.id } });
  },

  /** Admin — daftar semua prospek. */
  async list(req, res) {
    res.json({ data: LeadModel.listAll() });
  },

  /** Admin — ubah status. */
  async setStatus(req, res) {
    const { status } = req.body || {};
    if (!VALID_STATUS.includes(status)) return res.status(400).json({ error: `status harus: ${VALID_STATUS.join(', ')}` });
    const lead = LeadModel.updateStatus(Number(req.params.id), status);
    if (!lead) return res.status(404).json({ error: 'Prospek tidak ditemukan' });
    res.json({ data: lead });
  },
};
