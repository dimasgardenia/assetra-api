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

    /* Marketplace: listing portal, prospek, KPR, agen — hitungan nyata untuk dasbor. */
    const portalListings = db.prepare(`SELECT COUNT(*) AS c FROM listings WHERE source = 'portal'`).get().c;
    const totalLeads = db.prepare(`SELECT COUNT(*) AS c FROM leads`).get().c;
    const newLeads = db.prepare(`SELECT COUNT(*) AS c FROM leads WHERE status = 'new'`).get().c;
    const totalKpr = db.prepare(`SELECT COUNT(*) AS c FROM kpr_applications`).get().c;
    const newKpr = db.prepare(`SELECT COUNT(*) AS c FROM kpr_applications WHERE status = 'submitted'`).get().c;
    const totalAgents = db.prepare(`SELECT COUNT(*) AS c FROM agents`).get().c;
    const liveAgents = db.prepare(`SELECT COUNT(*) AS c FROM agents WHERE status = 'live'`).get().c;
    const activeBanners = db.prepare(`SELECT COUNT(*) AS c FROM ad_banners WHERE active = 1`).get().c;

    /* Aktivitas terbaru gabungan (prospek + KPR) — 6 kejadian terakhir. */
    const recentLeads = db.prepare(`SELECT 'lead' AS kind, type AS sub, listing_title AS title, name, created_at FROM leads ORDER BY created_at DESC LIMIT 6`).all();
    const recentKpr = db.prepare(`SELECT 'kpr' AS kind, bank AS sub, name AS title, name, created_at FROM kpr_applications ORDER BY created_at DESC LIMIT 6`).all();
    const recent = [...recentLeads, ...recentKpr].sort((a, b) => b.created_at - a.created_at).slice(0, 6);

    /* Prospek per saluran (nyata) — untuk grafik komposisi di dasbor. */
    const leadsByTypeRows = db.prepare(`SELECT type, COUNT(*) AS c FROM leads GROUP BY type`).all();
    const leadsByType = { whatsapp: 0, call: 0, survey: 0, ai: 0 };
    leadsByTypeRows.forEach(r => { if (r.type in leadsByType) leadsByType[r.type] = r.c; });

    res.json({
      data: {
        activeAuctions, totalListings, totalUsers, pendingKyc, totalGmv, totalPhotos, totalDocs,
        portalListings, totalLeads, newLeads, totalKpr, newKpr, totalAgents, liveAgents, activeBanners,
        recent, leadsByType,
      },
    });
  },
};
