/* Admin dashboard KPIs. */
import { db } from '../config/db.js';

export const statsController = {
  async dashboard(req, res) {
    const activeAuctions = db.prepare(`SELECT COUNT(*) AS c FROM listings WHERE status = 'live'`).get().c;
    const totalListings = db.prepare(`SELECT COUNT(*) AS c FROM listings`).get().c;
    const totalUsers = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
    const pendingKyc = db.prepare(`SELECT COUNT(*) AS c FROM kyc_submissions WHERE status = 'pending'`).get().c;
    const totalGmv = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM bids`).get().s;
    const totalPhotos = db.prepare(`SELECT COUNT(*) AS c FROM listing_photos`).get().c;
    const totalDocs = db.prepare(`SELECT COUNT(*) AS c FROM listing_documents`).get().c;
    res.json({
      data: { activeAuctions, totalListings, totalUsers, pendingKyc, totalGmv, totalPhotos, totalDocs },
    });
  },
};
