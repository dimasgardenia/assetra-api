import { db } from '../config/db.js';

const COLS = 'id, listing_id AS listingId, slot, path, original_name AS originalName, size_bytes AS sizeBytes, mime_type AS mimeType, uploaded_at AS uploadedAt';

export const ListingDocumentModel = {
  listByListing(listingId) {
    return db.prepare(`SELECT ${COLS} FROM listing_documents WHERE listing_id = ? ORDER BY slot ASC`).all(listingId);
  },

  listAll() {
    return db.prepare(`
      SELECT ld.*, l.title AS listing_title,
             ld.id AS id, ld.listing_id AS listingId, ld.slot, ld.path,
             ld.original_name AS originalName, ld.size_bytes AS sizeBytes,
             ld.mime_type AS mimeType, ld.uploaded_at AS uploadedAt
      FROM listing_documents ld
      LEFT JOIN listings l ON l.id = ld.listing_id
      ORDER BY ld.uploaded_at DESC
    `).all();
  },

  upsert({ listingId, slot, path, originalName, sizeBytes, mimeType }) {
    // Replace existing doc in same slot
    db.prepare(`DELETE FROM listing_documents WHERE listing_id = ? AND slot = ?`).run(listingId, slot);
    const r = db.prepare(`
      INSERT INTO listing_documents (listing_id, slot, path, original_name, size_bytes, mime_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(listingId, slot, path, originalName, sizeBytes, mimeType);
    return db.prepare(`SELECT ${COLS} FROM listing_documents WHERE id = ?`).get(r.lastInsertRowid);
  },

  remove(listingId, slot) {
    const row = db.prepare(`SELECT ${COLS} FROM listing_documents WHERE listing_id = ? AND slot = ?`).get(listingId, slot);
    if (!row) return null;
    db.prepare(`DELETE FROM listing_documents WHERE listing_id = ? AND slot = ?`).run(listingId, slot);
    return row;
  },
};
