CREATE TABLE catch_inventory_observations (
  observation_id TEXT PRIMARY KEY,
  listing_key TEXT NOT NULL,
  asin TEXT NOT NULL,
  observed_state TEXT NOT NULL CHECK(observed_state IN ('BUYABLE','PREORDER_BUYABLE','SOLD_OUT','UNKNOWN','BLOCKED','ERROR')),
  price_mxn REAL,
  seller TEXT,
  fulfilled_by TEXT,
  evidence_type TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX idx_catch_inventory_observations_asin ON catch_inventory_observations(asin,observed_at DESC);
ALTER TABLE inventory ADD COLUMN seller TEXT;
ALTER TABLE inventory ADD COLUMN fulfilled_by TEXT;
ALTER TABLE inventory ADD COLUMN availability_evidence_type TEXT;
PRAGMA optimize;
