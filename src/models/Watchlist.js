import { db } from '../config/db.js';

export const WatchlistModel = {
  listForUser(userId) {
    return db.prepare(`
      SELECT l.id, l.title, l.type, l.address, l.region, l.current_bid AS currentBid,
             l.end_date AS endDate, l.status, l.trust_score AS trustScore,
             w.added_at AS addedAt
      FROM watchlist w
      JOIN listings l ON l.id = w.listing_id
      WHERE w.user_id = ?
      ORDER BY w.added_at DESC
    `).all(userId);
  },

  add(userId, listingId) {
    db.prepare(`INSERT OR IGNORE INTO watchlist (user_id, listing_id) VALUES (?, ?)`).run(userId, listingId);
    return WatchlistModel.has(userId, listingId);
  },

  remove(userId, listingId) {
    db.prepare(`DELETE FROM watchlist WHERE user_id = ? AND listing_id = ?`).run(userId, listingId);
    return true;
  },

  has(userId, listingId) {
    return !!db.prepare(`SELECT 1 FROM watchlist WHERE user_id = ? AND listing_id = ?`).get(userId, listingId);
  },
};
