CREATE TABLE amazon_verification_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asin TEXT NOT NULL REFERENCES amazon_watchlist(asin),
  evidence_revision TEXT NOT NULL UNIQUE,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('VERIFIED','REVIEW_REQUIRED','REJECTED','ERROR')),
  method TEXT NOT NULL,
  access_outcome TEXT NOT NULL,
  http_status INTEGER,
  product_url TEXT NOT NULL,
  canonical_product_id TEXT,
  product_name TEXT NOT NULL,
  watch_category TEXT NOT NULL,
  language TEXT NOT NULL,
  retailer TEXT NOT NULL,
  retailer_identifier TEXT NOT NULL,
  observed_price_mxn REAL,
  observed_availability TEXT,
  evidence_json TEXT NOT NULL,
  gate_results_json TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK(confidence IN ('HIGH','MEDIUM','LOW')),
  unresolved_questions TEXT,
  proposed_lane TEXT CHECK(proposed_lane IN ('priority','normal')),
  proposed_routing_key TEXT CHECK(proposed_routing_key IN ('pokemon-main','delta-reign','magic-hobbit')),
  proposed_alert_on_initial_buyable INTEGER CHECK(proposed_alert_on_initial_buyable IN (0,1)),
  created_by TEXT NOT NULL
);

CREATE INDEX idx_amazon_verification_attempts_asin ON amazon_verification_attempts(asin,completed_at DESC);
CREATE INDEX idx_amazon_verification_attempts_outcome ON amazon_verification_attempts(outcome,completed_at DESC);

CREATE TABLE amazon_catalog_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asin TEXT NOT NULL REFERENCES amazon_watchlist(asin),
  verification_attempt_id INTEGER NOT NULL REFERENCES amazon_verification_attempts(id),
  evidence_revision TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('APPROVED','REJECTED','PUBLISHED')),
  reason TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  resulting_catalog_version TEXT
);

CREATE INDEX idx_amazon_catalog_decisions_asin ON amazon_catalog_decisions(asin,decided_at DESC);

ALTER TABLE amazon_watchlist ADD COLUMN verification_attempt_id INTEGER REFERENCES amazon_verification_attempts(id);
ALTER TABLE amazon_watchlist ADD COLUMN evidence_revision TEXT;
ALTER TABLE amazon_watchlist ADD COLUMN verified_at TEXT;

PRAGMA optimize;
