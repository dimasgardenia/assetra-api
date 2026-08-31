/* Nomor kontak (WhatsApp/telepon) — HANYA untuk pengguna terautentikasi.
   Nomor tidak pernah dikirim ke tamu; frontend memanggil ini setelah login. */
import { env } from '../config/env.js';
import { AgentModel } from '../models/Agent.js';

export const contactController = {
  /** Kembalikan nomor WhatsApp kontak. Jika ?agent=<nama> cocok & punya nomor,
   *  pakai nomor agen tersebut; jika tidak, pakai nomor admin Assetra. */
  async get(req, res) {
    const adminWa = env.CONTACT_WA;
    let whatsapp = adminWa;
    let source = 'admin';

    const agentName = (req.query.agent || '').toString().trim();
    if (agentName) {
      const agent = AgentModel.getByName(agentName);
      if (agent?.phone) {
        /* Simpan sebagai digit saja (format wa.me): 62812... */
        whatsapp = agent.phone.replace(/[^\d]/g, '');
        source = 'agent';
      }
    }
    res.json({ data: { whatsapp, source } });
  },
};
