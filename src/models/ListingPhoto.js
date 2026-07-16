import { db } from '../config/db.js';

const COLS = 'id, listing_id AS listingId, path, original_name AS originalName, size_bytes AS sizeBytes, mime_type AS mimeType, position, uploaded_at AS uploadedAt';

export const ListingPhotoModel = {
  listByListing(listingId) {
    return db.prepare(`SELECT ${COLS} FROM listing_photos WHERE listing_id = ? ORDER BY position ASC, id ASC`).all(listingId);
  },

  countAll() {
    return db.prepare(`SELECT COUNT(*) AS c FROM listing_photos`).get().c;
  },

  create({ listingId, path, originalName, sizeBytes, mimeType }) {
    const maxPos = db.prepare(`SELECT COALESCE(MAX(position), -1) AS m FROM listing_photos WHERE listing_id = ?`).get(listingId).m;
    const r = db.prepare(`
      INSERT INTO listing_photos (listing_id, path, original_name, size_bytes, mime_type, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(listingId, path, originalName, sizeBytes, mimeType, maxPos + 1);
    return db.prepare(`SELECT ${COLS} FROM listing_photos WHERE id = ?`).get(r.lastInsertRowid);
  },

  remove(id) {
    const row = db.prepare(`SELECT ${COLS} FROM listing_photos WHERE id = ?`).get(id);
    if (!row) return null;
    db.prepare(`DELETE FROM listing_photos WHERE id = ?`).run(id);
    return row;
  },

  reorder(listingId, orderedIds) {
    const upd = db.prepare(`UPDATE listing_photos SET position = ? WHERE id = ? AND listing_id = ?`);
    const tx = db.transaction((ids) => ids.forEach((id, i) => upd.run(i, id, listingId)));
    tx(orderedIds);
    return ListingPhotoModel.listByListing(listingId);
  },
};
