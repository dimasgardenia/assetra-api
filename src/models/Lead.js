import { db } from '../config/db.js';

const COLS = `
  id, name, phone, listing_id AS listingId, listing_title AS listingTitle,
  type, message, status, created_at AS createdAt
`;

export const LeadModel = {
  create(input) {
    const info = db.prepare(`
      INSERT INTO leads (name, phone, listing_id, listing_title, type, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'new', ?)
    `).run(
      input.name || null, input.phone || null,
      input.listingId != null ? String(input.listingId) : null,
      input.listingTitle || null, input.type || 'whatsapp',
      input.message || null, Date.now(),
    );
    return db.prepare(`SELECT ${COLS} FROM leads WHERE id = ?`).get(info.lastInsertRowid);
  },

  listAll() {
    return db.prepare(`SELECT ${COLS} FROM leads ORDER BY created_at DESC`).all();
  },

  updateStatus(id, status) {
    db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, id);
    return db.prepare(`SELECT ${COLS} FROM leads WHERE id = ?`).get(id);
  },

  countByStatus(status) {
    return db.prepare('SELECT COUNT(*) AS n FROM leads WHERE status = ?').get(status).n;
  },

  countAll() {
    return db.prepare('SELECT COUNT(*) AS n FROM leads').get().n;
  },
};
