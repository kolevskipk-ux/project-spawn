ALTER TABLE catch_inventory_observations ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE catch_inventory_observations ADD COLUMN source_owner TEXT NOT NULL DEFAULT 'catch';
ALTER TABLE catch_inventory_observations ADD COLUMN transition_id TEXT;
ALTER TABLE catch_inventory_observations ADD COLUMN delivery_outcome TEXT;
ALTER TABLE catch_inventory_observations ADD COLUMN price_verification_status TEXT NOT NULL DEFAULT 'PENDING';
CREATE UNIQUE INDEX idx_catch_inventory_transition ON catch_inventory_observations(transition_id) WHERE transition_id IS NOT NULL;

ALTER TABLE inventory ADD COLUMN price_verification_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE inventory ADD COLUMN availability_freshness_status TEXT NOT NULL DEFAULT 'REVALIDATION_PENDING';
ALTER TABLE inventory ADD COLUMN availability_observed_at TEXT;
ALTER TABLE inventory ADD COLUMN pricing_observed_at TEXT;

CREATE TABLE amazon_enrichment_queue (
  transition_id TEXT PRIMARY KEY,
  listing_key TEXT NOT NULL REFERENCES inventory(listing_key),
  asin TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('BECAME_BUYABLE','DAILY_REFRESH')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED','SUPPRESSED')),
  requested_at TEXT NOT NULL,
  next_eligible_at TEXT NOT NULL,
  completed_at TEXT,
  last_error TEXT
);
CREATE INDEX idx_amazon_enrichment_due ON amazon_enrichment_queue(status,next_eligible_at);
PRAGMA optimize;
