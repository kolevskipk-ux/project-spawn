ALTER TABLE inventory ADD COLUMN availability_state TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE monitoring_candidates ADD COLUMN product_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE monitoring_candidates ADD COLUMN availability_state TEXT NOT NULL DEFAULT 'unknown';

CREATE TABLE IF NOT EXISTS weekly_feedback_campaigns (
  week_key TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  discord_message_id TEXT
);

CREATE TABLE IF NOT EXISTS weekly_feedback_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_key TEXT NOT NULL,
  client_nonce TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  usefulness INTEGER NOT NULL CHECK(usefulness BETWEEN 1 AND 10),
  alert_accuracy INTEGER NOT NULL CHECK(alert_accuracy BETWEEN 1 AND 5),
  pricing_accuracy INTEGER NOT NULL CHECK(pricing_accuracy BETWEEN 1 AND 5),
  vendor_quality INTEGER NOT NULL CHECK(vendor_quality BETWEEN 1 AND 5),
  alert_timing INTEGER NOT NULL CHECK(alert_timing BETWEEN 1 AND 5),
  noise INTEGER NOT NULL CHECK(noise BETWEEN 1 AND 5),
  successful_purchase INTEGER NOT NULL CHECK(successful_purchase IN (0,1)),
  most_useful TEXT,
  fix_first TEXT,
  suggestions TEXT,
  price_99 TEXT NOT NULL,
  price_149 TEXT NOT NULL,
  price_199 TEXT NOT NULL,
  price_299 TEXT NOT NULL,
  basic_value INTEGER NOT NULL CHECK(basic_value BETWEEN 1 AND 5),
  premium_value INTEGER NOT NULL CHECK(premium_value BETWEEN 1 AND 5),
  UNIQUE(week_key, client_nonce)
);

CREATE INDEX IF NOT EXISTS idx_weekly_feedback_trend ON weekly_feedback_responses(week_key, submitted_at);

CREATE TABLE IF NOT EXISTS vendor_issue_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_key TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  reported_at TEXT NOT NULL,
  reporter TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_at TEXT,
  review_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_vendor_issue_review ON vendor_issue_reports(status, reported_at);
PRAGMA optimize;
