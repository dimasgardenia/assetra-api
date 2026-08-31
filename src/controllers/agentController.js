/* Agen lapangan: daftar publik (untuk kartu Detail) + CRUD admin di menu "Agents". */
import { AgentModel } from '../models/Agent.js';
import { normalizeIndoPhone } from '../utils/phone.js';

const VALID_STATUS = ['live', 'review'];
/* Batas ukuran data URL foto agar payload JSON tetap kecil (~300 KB base64). */
const MAX_PHOTO_LEN = 400_000;

function cleanPhoto(photo) {
  if (photo == null || photo === '') return null;
  const s = String(photo);
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(s)) {
    const e = new Error('Foto harus berupa data URL gambar (png/jpg/webp)');
    e.status = 400; throw e;
  }
  if (s.length > MAX_PHOTO_LEN) {
    const e = new Error('Foto terlalu besar — gunakan gambar lebih kecil');
    e.status = 400; throw e;
  }
  return s;
}

export const agentController = {
  /** Publik — daftar agen (tanpa nomor telepon penuh). */
  async listPublic(req, res) {
    const rows = AgentModel.listAll().map(a => ({
      id: a.id, name: a.name, area: a.area, photo: a.photo,
      deals: a.deals, rating: a.rating, status: a.status,
    }));
    res.json({ data: rows });
  },

  /** Publik — pendaftaran mandiri agen dari halaman Buat Akun.
   *  Selalu masuk sebagai status 'review' (menunggu persetujuan admin). */
  async apply(req, res) {
    const { name, area, phone, photo, email } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nama wajib diisi' });
    const normPhone = phone ? normalizeIndoPhone(phone) : null;
    if (phone && !normPhone) return res.status(400).json({ error: 'Nomor telepon tidak valid — gunakan 08xx / +62xx' });
    const agent = AgentModel.create({
      name: String(name).trim(),
      area: area ? String(area).trim() : null,
      phone: normPhone,
      email: email ? String(email).trim().toLowerCase() : null,
      photo: cleanPhoto(photo),
      deals: 0,
      rating: null,
      status: 'review',
    });
    console.log(`[agent] pendaftaran baru: ${agent.name} (${agent.area || '-'})`);
    return res.status(201).json({ data: { id: agent.id, name: agent.name, status: agent.status } });
  },

  /** Status kartu agen untuk user yang login (dicocokkan via email).
   *  Dipakai frontend menentukan "agent terverifikasi" (status 'live'). */
  async me(req, res) {
    const agent = AgentModel.getByEmail(req.user?.email);
    if (!agent) return res.json({ data: { isAgent: false, status: null } });
    res.json({ data: { isAgent: true, status: agent.status, name: agent.name, area: agent.area } });
  },

  /** Admin — daftar lengkap. */
  async list(req, res) {
    res.json({ data: AgentModel.listAll() });
  },

  /** Admin — tambah agen. */
  async create(req, res) {
    const { name, area, phone, photo, deals, rating, status } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nama wajib diisi' });
    const normPhone = phone ? normalizeIndoPhone(phone) : null;
    if (phone && !normPhone) return res.status(400).json({ error: 'Nomor telepon tidak valid — gunakan 08xx / +62xx' });
    const agent = AgentModel.create({
      name: String(name).trim(),
      area: area ? String(area).trim() : null,
      phone: normPhone,
      photo: cleanPhoto(photo),
      deals: deals != null ? Number(deals) : 0,
      rating: rating != null ? Number(rating) : null,
      status: VALID_STATUS.includes(status) ? status : 'review',
    });
    res.status(201).json({ data: agent });
  },

  /** Admin — ubah agen (termasuk foto). */
  async update(req, res) {
    const id = Number(req.params.id);
    const b = req.body || {};
    const patch = {};
    if (b.name !== undefined) {
      if (!String(b.name).trim()) return res.status(400).json({ error: 'Nama tidak boleh kosong' });
      patch.name = String(b.name).trim();
    }
    if (b.area !== undefined) patch.area = b.area ? String(b.area).trim() : null;
    if (b.phone !== undefined) {
      const np = b.phone ? normalizeIndoPhone(b.phone) : null;
      if (b.phone && !np) return res.status(400).json({ error: 'Nomor telepon tidak valid' });
      patch.phone = np;
    }
    if (b.photo !== undefined) patch.photo = cleanPhoto(b.photo);
    if (b.deals !== undefined) patch.deals = Number(b.deals);
    if (b.rating !== undefined) patch.rating = b.rating == null ? null : Number(b.rating);
    if (b.status !== undefined) {
      if (!VALID_STATUS.includes(b.status)) return res.status(400).json({ error: `status harus: ${VALID_STATUS.join(', ')}` });
      patch.status = b.status;
    }
    const agent = AgentModel.update(id, patch);
    if (!agent) return res.status(404).json({ error: 'Agen tidak ditemukan' });
    res.json({ data: agent });
  },

  /** Admin — hapus agen. */
  async remove(req, res) {
    const ok = AgentModel.remove(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'Agen tidak ditemukan' });
    res.json({ data: { ok: true } });
  },
};
