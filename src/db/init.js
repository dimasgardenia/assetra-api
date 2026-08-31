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

  /* Pengajuan KPR dari halaman Financing (form publik → dashboard admin). */
  db.exec(`
    CREATE TABLE IF NOT EXISTS kpr_applications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      phone        TEXT NOT NULL,
      email        TEXT,
      income       INTEGER,
      bank         TEXT,               -- bank pilihan, atau 'Semua bank' untuk pra-persetujuan
      property_price INTEGER,
      loan_amount  INTEGER,
      down_payment INTEGER,
      tenor_years  INTEGER,
      rate         REAL,
      status       TEXT NOT NULL DEFAULT 'submitted',  -- submitted | review | approved | rejected
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_kpr_status ON kpr_applications(status, created_at DESC);
  `);

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

  /* Agen lapangan — dikelola di menu "Agents" back office. Foto disimpan
     sebagai data URL (avatar kecil) agar tidak perlu pipeline file terpisah. */
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      area        TEXT,
      phone       TEXT,
      photo       TEXT,                         -- data:image/...;base64,... (avatar terkompres)
      deals       INTEGER NOT NULL DEFAULT 0,
      rating      REAL,
      status      TEXT NOT NULL DEFAULT 'review', -- live | review
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `);
  /* Prospek (leads) — ketertarikan dari tombol kontak (WhatsApp/telepon/survei)
     di halaman listing & konsultan AI. Tertangkap otomatis, muncul di menu Prospek. */
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT,                            -- nama peminat bila login, jika tidak null
      phone         TEXT,
      listing_id    TEXT,
      listing_title TEXT,
      type          TEXT NOT NULL DEFAULT 'whatsapp',-- whatsapp | call | survey | ai
      message       TEXT,
      status        TEXT NOT NULL DEFAULT 'new',     -- new | contacted | closed
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, created_at DESC);
  `);

  /* Kaitkan kartu agen ke email pendaftar → cek status 'live' per user. */
  const agentColsNow = db.prepare('PRAGMA table_info(agents)').all().map(c => c.name);
  if (!agentColsNow.includes('email')) db.exec('ALTER TABLE agents ADD COLUMN email TEXT');

  /* Perubahan akun tertunda (ganti nama/email/telepon/sandi) — butuh OTP.
     Satu perubahan aktif per user (di-overwrite bila minta lagi). */
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_changes (
      user_id     INTEGER PRIMARY KEY,
      field       TEXT NOT NULL,          -- name | email | phone | password
      payload     TEXT NOT NULL,          -- JSON: { value, passwordHash? }
      otp         TEXT NOT NULL,
      channel     TEXT NOT NULL,          -- email | whatsapp
      expires     INTEGER NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `);

  /* Seed sekali dari daftar demo bila tabel masih kosong. */
  const agentCount = db.prepare('SELECT COUNT(*) AS n FROM agents').get().n;
  if (agentCount === 0) {
    const seed = db.prepare('INSERT INTO agents (name, area, deals, rating, status) VALUES (?, ?, ?, ?, ?)');
    [
      ['Bagus Santoso', 'Jakarta Selatan', 142, 4.9, 'live'],
      ['Dewi Lestari', 'Menteng', 98, 4.8, 'live'],
      ['Putu Surya', 'Bali', 76, 4.9, 'live'],
      ['Sari Indah', 'Kuningan', 54, 4.6, 'review'],
    ].forEach(r => seed.run(...r));
  }

  console.log('[db] schema applied');
}
