import { db } from '../config/db.js';

const COLS = `id, name, area, phone, email, photo, deals, rating, status, created_at AS createdAt`;

export const AgentModel = {
  listAll() {
    return db.prepare(`SELECT ${COLS} FROM agents ORDER BY deals DESC, name ASC`).all();
  },

  getById(id) {
    return db.prepare(`SELECT ${COLS} FROM agents WHERE id = ?`).get(id);
  },

  /** Cari agen berdasarkan nama (case-insensitive) — dipakai kartu Detail untuk foto. */
  getByName(name) {
    return db.prepare(`SELECT ${COLS} FROM agents WHERE lower(name) = lower(?)`).get(String(name).trim());
  },

  /** Cari agen berdasarkan email pendaftar — untuk cek status akun agen. */
  getByEmail(email) {
    if (!email) return null;
    return db.prepare(`SELECT ${COLS} FROM agents WHERE lower(email) = lower(?)`).get(String(email).trim());
  },

  create(input) {
    const info = db.prepare(`
      INSERT INTO agents (name, area, phone, email, photo, deals, rating, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.name, input.area || null, input.phone || null, input.email || null, input.photo || null,
      input.deals ?? 0, input.rating ?? null, input.status || 'review', Date.now(),
    );
    return this.getById(info.lastInsertRowid);
  },

  /** Update sebagian — hanya field yang dikirim yang diubah. */
  update(id, patch) {
    const current = this.getById(id);
    if (!current) return null;
    const fields = ['name', 'area', 'phone', 'photo', 'deals', 'rating', 'status'];
    const sets = [];
    const vals = [];
    for (const f of fields) {
      if (patch[f] !== undefined) { sets.push(`${f} = ?`); vals.push(patch[f]); }
    }
    if (sets.length) {
      vals.push(id);
      db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    return this.getById(id);
  },

  remove(id) {
    return db.prepare('DELETE FROM agents WHERE id = ?').run(id).changes > 0;
  },
};
