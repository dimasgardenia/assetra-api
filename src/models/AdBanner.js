import { db } from '../config/db.js';

const COLS = 'id, placement, image_path AS imagePath, link_url AS linkUrl, title, active, clicks, created_at AS createdAt';

export const AdBannerModel = {
  /** Map of placement → active banner (public site). */
  activeByPlacement() {
    const rows = db.prepare(`SELECT ${COLS} FROM ad_banners WHERE active = 1`).all();
    return Object.fromEntries(rows.map(r => [r.placement, r]));
  },

  listAll() {
    return db.prepare(`SELECT ${COLS} FROM ad_banners ORDER BY created_at DESC`).all();
  },

  findById(id) {
    return db.prepare(`SELECT ${COLS} FROM ad_banners WHERE id = ?`).get(id);
  },

  /** Create a banner and make it the only active one for its placement. */
  create({ placement, imagePath, linkUrl, title }) {
    const tx = db.transaction(() => {
      db.prepare('UPDATE ad_banners SET active = 0 WHERE placement = ?').run(placement);
      const info = db.prepare(`
        INSERT INTO ad_banners (placement, image_path, link_url, title, active, clicks, created_at)
        VALUES (?, ?, ?, ?, 1, 0, ?)
      `).run(placement, imagePath, linkUrl, title || null, Date.now());
      return info.lastInsertRowid;
    });
    return AdBannerModel.findById(tx());
  },

  incrementClick(id) {
    return db.prepare('UPDATE ad_banners SET clicks = clicks + 1 WHERE id = ?').run(id).changes > 0;
  },

  remove(id) {
    return db.prepare('DELETE FROM ad_banners WHERE id = ?').run(id).changes > 0;
  },
};
