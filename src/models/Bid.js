import { db } from '../config/db.js';

export const BidModel = {
  listByListing(listingId, { limit = 50 } = {}) {
    return db.prepare(`
      SELECT id, listing_id AS listingId, user_id AS userId, amount, who, verified, created_at AS createdAt
      FROM bids
      WHERE listing_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(listingId, limit);
  },

  listByUser(userId, { limit = 100 } = {}) {
    return db.prepare(`
      SELECT b.id, b.listing_id AS listingId, b.amount, b.who, b.verified, b.created_at AS createdAt,
             l.title AS listingTitle, l.current_bid AS listingCurrentBid
      FROM bids b
      LEFT JOIN listings l ON l.id = b.listing_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
      LIMIT ?
    `).all(userId, limit);
  },

  topByListing(listingId) {
    return db.prepare(`
      SELECT amount, user_id AS userId, who, created_at AS createdAt
      FROM bids
      WHERE listing_id = ?
      ORDER BY amount DESC
      LIMIT 1
    `).get(listingId);
  },

  create({ listingId, userId, amount, who, verified }) {
    const r = db.prepare(`
      INSERT INTO bids (listing_id, user_id, amount, who, verified)
      VALUES (?, ?, ?, ?, ?)
    `).run(listingId, userId || null, amount, who, verified || null);
    return db.prepare(`
      SELECT id, listing_id AS listingId, user_id AS userId, amount, who, verified, created_at AS createdAt
      FROM bids WHERE id = ?
    `).get(r.lastInsertRowid);
  },
};
