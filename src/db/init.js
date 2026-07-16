/* Read schema.sql and apply it. Idempotent (all CREATE IF NOT EXISTS). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Marketplace columns added after the original auction schema — applied
   as idempotent ALTERs so existing databases upgrade in place. */
const LISTING_MIGRATIONS = [
  ['price', 'INTEGER'],        // marketplace asking price (vs auction current_bid)
  ['mode', 'TEXT'],            // 'sale' | 'rent' | 'new'
  ['beds', 'INTEGER'],
  ['baths', 'INTEGER'],
  ['area', 'INTEGER'],
  ['agent_name', 'TEXT'],
  ['agency', 'TEXT'],
  ['promo', 'TEXT'],           // 'Featured' | 'Sponsored' | null
  ['source', 'TEXT'],          // 'portal' = marketplace listing (vs auction seed)
  ['description', 'TEXT'],     // overview / ikhtisar
  ['certificate', 'TEXT'],     // SHM | HGB | SHMSRS | Girik | AJB
  ['year_built', 'INTEGER'],
  ['building_area', 'INTEGER'],// m² (area = land)
  ['floors', 'INTEGER'],
  ['facilities', 'TEXT'],      // JSON array of strings
];

export function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
  const existing = db.prepare('PRAGMA table_info(listings)').all().map(c => c.name);
  for (const [name, type] of LISTING_MIGRATIONS) {
    if (!existing.includes(name)) db.exec(`ALTER TABLE listings ADD COLUMN ${name} ${type}`);
  }

  /* Password reset + email verification — token migrations on users. */
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('reset_token')) db.exec('ALTER TABLE users ADD COLUMN reset_token TEXT');
  if (!userCols.includes('reset_expires')) db.exec('ALTER TABLE users ADD COLUMN reset_expires INTEGER');
  if (!userCols.includes('email_verified')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
    /* Grandfather: semua akun yang sudah ada sebelum fitur ini dianggap
       terverifikasi (termasuk demo admin/bidder). Pendaftaran baru mulai dari 0. */
    db.exec('UPDATE users SET email_verified = 1');
  }
  if (!userCols.includes('verify_token')) db.exec('ALTER TABLE users ADD COLUMN verify_token TEXT');
  if (!userCols.includes('verify_expires')) db.exec('ALTER TABLE users ADD COLUMN verify_expires INTEGER');
  /* Verifikasi nomor WhatsApp (OTP). Akun lama tanpa nomor tidak diblokir. */
  if (!userCols.includes('phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  if (!userCols.includes('phone_verified')) db.exec('ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0');
  if (!userCols.includes('phone_otp')) db.exec('ALTER TABLE users ADD COLUMN phone_otp TEXT');
  if (!userCols.includes('phone_otp_expires')) db.exec('ALTER TABLE users ADD COLUMN phone_otp_expires INTEGER');

  /* Ad banners — one active banner per placement, with click tracking. */
  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_banners (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      placement   TEXT NOT NULL,               -- 'home-leaderboard' | 'home-box' | 'search-box' | 'search-leaderboard' | 'detail-box'
      image_path  TEXT NOT NULL,               -- /files/banners/xxx.jpg
      link_url    TEXT NOT NULL,
      title       TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      clicks      INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_banners_placement ON ad_banners(placement, active);
  `);

  console.log('[db] schema applied');
}
