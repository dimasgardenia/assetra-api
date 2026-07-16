/* Assetra DB schema — SQLite */

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'bidder',  -- 'bidder' | 'admin'
  account_type  TEXT,                            -- 'individual' | 'company'
  kyc_verified  INTEGER NOT NULL DEFAULT 0,
  picture       TEXT,
  provider      TEXT,                            -- 'google' | 'email' | 'admin'
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS listings (
  id              TEXT PRIMARY KEY,              -- e.g. AST·2026·0847
  title           TEXT NOT NULL,
  type            TEXT NOT NULL,                 -- 'villa' | 'property' | 'land' | 'commercial' | 'apartment'
  type_label      TEXT,
  address         TEXT,
  region          TEXT,
  current_bid     INTEGER NOT NULL DEFAULT 0,
  starting_bid    INTEGER NOT NULL DEFAULT 0,
  buy_now         INTEGER NOT NULL DEFAULT 0,
  deposit         INTEGER NOT NULL DEFAULT 0,
  bidders         INTEGER NOT NULL DEFAULT 0,
  bids            INTEGER NOT NULL DEFAULT 0,
  end_date        INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'soon',  -- 'live' | 'soon' | 'closed' | 'draft' | 'review'
  trust_score     INTEGER NOT NULL DEFAULT 90,
  verifications   TEXT NOT NULL DEFAULT '["SHM","BPN"]',  -- JSON array
  cover_photo_id  INTEGER,                       -- nullable FK to listing_photos
  created_by      INTEGER REFERENCES users(id),
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_region ON listings(region);
CREATE INDEX IF NOT EXISTS idx_listings_type   ON listings(type);

CREATE TABLE IF NOT EXISTS listing_photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id   TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,                    -- /files/photos/xxx.jpg
  original_name TEXT,
  size_bytes   INTEGER,
  mime_type    TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  uploaded_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_photos_listing ON listing_photos(listing_id, position);

CREATE TABLE IF NOT EXISTS listing_documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id   TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  slot         TEXT NOT NULL,                    -- 'shm' | 'bpn' | 'imb' | 'notary' | 'npwp' | ...
  path         TEXT NOT NULL,
  original_name TEXT,
  size_bytes   INTEGER,
  mime_type    TEXT,
  uploaded_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  UNIQUE(listing_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_docs_listing ON listing_documents(listing_id);

CREATE TABLE IF NOT EXISTS bids (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id),
  amount      INTEGER NOT NULL,
  who         TEXT NOT NULL,                     -- display name / handle
  verified    TEXT,                              -- 'KEMENKEU' | 'BPN' | etc
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_bids_listing ON bids(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bids_user    ON bids(user_id);

CREATE TABLE IF NOT EXISTS watchlist (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id TEXT    NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  added_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  PRIMARY KEY(user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  notes        TEXT,
  submitted_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  reviewed_at  INTEGER,
  reviewer_id  INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_submissions(status);
