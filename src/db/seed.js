/* Seed DB with demo listings + demo admin user. Idempotent — skip if data already exists. */
import bcrypt from 'bcryptjs';
import { db } from '../config/db.js';
import { initSchema } from './init.js';

initSchema();

const LISTINGS_SEED = [
  { id: 'AST·2026·0847', title: 'Beachfront Villa Estate', type: 'villa', typeLabel: 'Residential · Villa', address: 'Jl. Pantai Batu Bolong 12, Canggu, Bali', region: 'Bali', currentBid: 8_750_000_000, startingBid: 7_500_000_000, buyNow: 12_000_000_000, deposit: 875_000_000, bidders: 14, bids: 32, endOffsetMs: 1000*60*60*26 + 1000*60*13, status: 'live', verifications: ['SHM','BPN','KEMENKEU'], trustScore: 96 },
  { id: 'AST·2026·0823', title: 'Productive Land Plot', type: 'land', typeLabel: 'Agricultural Land', address: 'Desa Sukamulya, Subang, West Java', region: 'West Java', currentBid: 2_450_000_000, startingBid: 2_000_000_000, buyNow: 3_500_000_000, deposit: 245_000_000, bidders: 8, bids: 17, endOffsetMs: 1000*60*60*4 + 1000*60*22, status: 'live', verifications: ['SHM','BPN'], trustScore: 92 },
  { id: 'AST·2026·0801', title: 'Heritage Townhouse', type: 'property', typeLabel: 'Residential', address: 'Jl. Cikini Raya 84, Menteng, Jakarta Pusat', region: 'Jakarta', currentBid: 14_200_000_000, startingBid: 12_000_000_000, buyNow: 18_500_000_000, deposit: 1_420_000_000, bidders: 21, bids: 47, endOffsetMs: 1000*60*60*52, status: 'live', verifications: ['SHM','IMB','BPN','KEMENKEU'], trustScore: 98 },
  { id: 'AST·2026·0795', title: 'Office Tower — Floor 14', type: 'commercial', typeLabel: 'Commercial', address: 'Sudirman CBD, Jakarta', region: 'Jakarta', currentBid: 32_000_000_000, startingBid: 28_000_000_000, buyNow: 45_000_000_000, deposit: 3_200_000_000, bidders: 6, bids: 9, endOffsetMs: 1000*60*60*96, status: 'soon', verifications: ['HGB','IMB','BPN'], trustScore: 94 },
  { id: 'AST·2026·0772', title: 'Mountain Retreat Compound', type: 'villa', typeLabel: 'Residential · Villa', address: 'Jl. Cikole, Lembang, Bandung Barat', region: 'West Java', currentBid: 6_100_000_000, startingBid: 5_500_000_000, buyNow: 8_900_000_000, deposit: 610_000_000, bidders: 11, bids: 24, endOffsetMs: 1000*60*60*12, status: 'live', verifications: ['SHM','BPN'], trustScore: 91 },
  { id: 'AST·2026·0768', title: 'Rice Field Holdings', type: 'land', typeLabel: 'Agricultural Land', address: 'Tegallalang, Gianyar, Bali', region: 'Bali', currentBid: 4_750_000_000, startingBid: 4_200_000_000, buyNow: 6_500_000_000, deposit: 475_000_000, bidders: 9, bids: 19, endOffsetMs: 1000*60*60*73, status: 'live', verifications: ['SHM','BPN','KEMENKEU'], trustScore: 95 },
];

const now = Date.now();

// 1. Demo admin user
const adminEmail = 'admin@assetra.co.id';
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (email, password_hash, name, role, kyc_verified, provider)
    VALUES (?, ?, ?, 'admin', 1, 'admin')
  `).run(adminEmail, hash, 'Admin Console');
  console.log(`[seed] created admin user → ${adminEmail} / admin123`);
} else {
  console.log(`[seed] admin user already exists`);
}

// 2. Demo bidder user
const bidderEmail = 'bidder@assetra.co.id';
const existingBidder = db.prepare('SELECT id FROM users WHERE email = ?').get(bidderEmail);
if (!existingBidder) {
  const hash = bcrypt.hashSync('bidder123', 10);
  db.prepare(`
    INSERT INTO users (email, password_hash, name, role, kyc_verified, provider)
    VALUES (?, ?, ?, 'bidder', 1, 'email')
  `).run(bidderEmail, hash, 'Demo Bidder');
  console.log(`[seed] created bidder user → ${bidderEmail} / bidder123`);
}

// 3. Listings
const insertListing = db.prepare(`
  INSERT OR IGNORE INTO listings
    (id, title, type, type_label, address, region, current_bid, starting_bid, buy_now, deposit, bidders, bids, end_date, status, trust_score, verifications, created_at, updated_at)
  VALUES (@id, @title, @type, @typeLabel, @address, @region, @currentBid, @startingBid, @buyNow, @deposit, @bidders, @bids, @endDate, @status, @trustScore, @verifications, @createdAt, @updatedAt)
`);

let inserted = 0;
const tx = db.transaction(() => {
  for (const l of LISTINGS_SEED) {
    const r = insertListing.run({
      ...l,
      endDate: now + l.endOffsetMs,
      verifications: JSON.stringify(l.verifications),
      createdAt: now,
      updatedAt: now,
    });
    if (r.changes > 0) inserted++;
  }
});
tx();
console.log(`[seed] listings: ${inserted} new (of ${LISTINGS_SEED.length} total)`);

// 4. Pending KYC submissions for demo
const insertKyc = db.prepare(`
  INSERT INTO kyc_submissions (user_id, status, submitted_at) VALUES (?, 'pending', ?)
`);
const bidderId = db.prepare('SELECT id FROM users WHERE email = ?').get(bidderEmail)?.id;
const existingKyc = db.prepare('SELECT COUNT(*) AS c FROM kyc_submissions').get().c;
if (bidderId && existingKyc === 0) {
  insertKyc.run(bidderId, now - 1000*60*60*2);
  console.log('[seed] inserted 1 demo KYC submission');
}

console.log('[seed] done');
process.exit(0);
