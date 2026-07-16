import { db } from '../config/db.js';

const COLS = `
  k.id, k.user_id AS userId, k.status, k.notes,
  k.submitted_at AS submittedAt, k.reviewed_at AS reviewedAt, k.reviewer_id AS reviewerId,
  u.name AS userName, u.email AS userEmail
`;

export const KycModel = {
  listAll() {
    return db.prepare(`SELECT ${COLS} FROM kyc_submissions k LEFT JOIN users u ON u.id = k.user_id ORDER BY k.submitted_at DESC`).all();
  },
  listByStatus(status) {
    return db.prepare(`SELECT ${COLS} FROM kyc_submissions k LEFT JOIN users u ON u.id = k.user_id WHERE k.status = ? ORDER BY k.submitted_at DESC`).all(status);
  },
  findById(id) {
    return db.prepare(`SELECT ${COLS} FROM kyc_submissions k LEFT JOIN users u ON u.id = k.user_id WHERE k.id = ?`).get(id);
  },
  create({ userId, notes = null }) {
    const r = db.prepare(`INSERT INTO kyc_submissions (user_id, notes) VALUES (?, ?)`).run(userId, notes);
    return KycModel.findById(r.lastInsertRowid);
  },
  setStatus(id, status, reviewerId) {
    db.prepare(`UPDATE kyc_submissions SET status = ?, reviewed_at = ?, reviewer_id = ? WHERE id = ?`)
      .run(status, Date.now(), reviewerId || null, id);
    return KycModel.findById(id);
  },
};
