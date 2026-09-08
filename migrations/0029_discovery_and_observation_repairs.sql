-- Rebuild dependent tables as well, preserving their data and foreign keys.
-- No cascading deletes and no disabling foreign-key enforcement.
CREATE TABLE search_accounting_repair_copy AS SELECT * FROM search_accounting;
CREATE TABLE search_reviews_repair_copy AS SELECT * FROM search_reviews;
DROP TABLE search_reviews;
DROP TABLE search_accounting;
CREATE TABLE scan_runs_rebuilt (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('cron', 'manual', 'early_asin')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  config_version TEXT NOT NULL,
  model TEXT NOT NULL,
  result_json TEXT,
  result_hash TEXT,
  discord_message_id TEXT,
  error TEXT
);


INSERT INTO scan_runs_rebuilt SELECT * FROM scan_runs;
DROP TABLE scan_runs;
ALTER TABLE scan_runs_rebuilt RENAME TO scan_runs;
CREATE INDEX idx_scan_runs_started_at ON scan_runs(started_at DESC);
CREATE TABLE search_accounting (
  scan_id TEXT PRIMARY KEY REFERENCES scan_runs(id),
  month TEXT NOT NULL REFERENCES search_budget_months(month),
  reserved_microusd INTEGER NOT NULL CHECK(reserved_microusd > 0),
  estimated_microusd INTEGER CHECK(estimated_microusd >= 0),
  response_id TEXT,
  usage_json TEXT,
  web_calls INTEGER,
  pricing_version TEXT NOT NULL,
  settled_at TEXT,
  new_listings INTEGER CHECK(new_listings >= 0),
  restocks INTEGER CHECK(restocks >= 0),
  unchanged INTEGER CHECK(unchanged >= 0),
  yield_recorded_at TEXT
);
CREATE INDEX search_accounting_month ON search_accounting(month);
CREATE TABLE search_reviews (
  scan_id TEXT PRIMARY KEY REFERENCES scan_runs(id),
  triggered_at TEXT NOT NULL,
  consecutive_empty INTEGER NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  note TEXT
);

INSERT INTO search_accounting SELECT * FROM search_accounting_repair_copy;
INSERT INTO search_reviews SELECT * FROM search_reviews_repair_copy;
DROP TABLE search_accounting_repair_copy;
DROP TABLE search_reviews_repair_copy;
CREATE TABLE catch_inventory_observations_rebuilt (
  observation_id TEXT PRIMARY KEY,
  listing_key TEXT NOT NULL,
  asin TEXT NOT NULL,
  observed_state TEXT NOT NULL CHECK(observed_state IN ('BUYABLE_FEATURED','BUYABLE_VIA_OPTIONS','NO_FEATURED_OFFER','BUYABLE','PREORDER_BUYABLE','SOLD_OUT','UNKNOWN','BLOCKED','ERROR')),
  price_mxn REAL,
  seller TEXT,
  fulfilled_by TEXT,
  evidence_type TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
 schema_version INTEGER NOT NULL DEFAULT 1,
 source_owner TEXT NOT NULL DEFAULT 'catch',
 transition_id TEXT,
 delivery_outcome TEXT,
 price_verification_status TEXT NOT NULL DEFAULT 'PENDING'
);

INSERT INTO catch_inventory_observations_rebuilt SELECT * FROM catch_inventory_observations;
DROP TABLE catch_inventory_observations;
ALTER TABLE catch_inventory_observations_rebuilt RENAME TO catch_inventory_observations;
CREATE INDEX idx_catch_inventory_observations_asin ON catch_inventory_observations(asin,observed_at DESC);
-- A transition can accompany multiple distinct observations. Deduplicate by observation_id.
CREATE INDEX idx_catch_inventory_transition ON catch_inventory_observations(transition_id) WHERE transition_id IS NOT NULL;
