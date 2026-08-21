CREATE TABLE IF NOT EXISTS inventory (
  listing_key TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  retailer TEXT NOT NULL,
  title TEXT NOT NULL,
  watch_category TEXT NOT NULL,
  retailer_sku TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'sold_out', 'unknown')),
  price_mxn REAL,
  language TEXT NOT NULL DEFAULT 'unknown',
  language_evidence TEXT NOT NULL DEFAULT '',
  msrp_mxn REAL,
  msrp_source_url TEXT,
  last_change_type TEXT NOT NULL DEFAULT 'baseline'
);

CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS inventory_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id TEXT NOT NULL,
  listing_key TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  status TEXT NOT NULL,
  price_mxn REAL,
  language TEXT NOT NULL,
  msrp_mxn REAL,
  change_type TEXT NOT NULL,
  evidence TEXT NOT NULL,
  UNIQUE(scan_id, listing_key)
);

CREATE TABLE IF NOT EXISTS feedback_tokens (
  token TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  listing_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  listing_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('got_one', 'too_expensive')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listing_feedback_key ON listing_feedback(listing_key, created_at DESC);
