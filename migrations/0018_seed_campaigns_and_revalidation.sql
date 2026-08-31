CREATE TABLE seed_campaigns (
  campaign_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  source TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  accepted_count INTEGER NOT NULL,
  duplicate_count INTEGER NOT NULL,
  rejected_count INTEGER NOT NULL
);

CREATE TABLE seed_batches (
  batch_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES seed_campaigns(campaign_id),
  submitted_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  accepted_count INTEGER NOT NULL,
  duplicate_count INTEGER NOT NULL,
  rejected_count INTEGER NOT NULL
);
CREATE INDEX idx_seed_batches_campaign ON seed_batches(campaign_id,received_at DESC);

CREATE TABLE seed_candidate_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES seed_campaigns(campaign_id),
  batch_id TEXT NOT NULL REFERENCES seed_batches(batch_id),
  source_id TEXT NOT NULL,
  candidate_id TEXT,
  canonical_url TEXT,
  retailer TEXT,
  retailer_identifier TEXT,
  product_name TEXT,
  disposition TEXT NOT NULL CHECK(disposition IN ('ACCEPTED','DUPLICATE','REJECTED')),
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  observed_at TEXT,
  received_at TEXT NOT NULL,
  UNIQUE(batch_id,source_id)
);
CREATE INDEX idx_seed_evidence_candidate ON seed_candidate_evidence(candidate_id,received_at DESC);

CREATE TABLE inventory_revalidation_state (
  listing_key TEXT PRIMARY KEY REFERENCES inventory(listing_key),
  lifecycle_state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(lifecycle_state IN ('ACTIVE','STALE','UNKNOWN','BLOCKED','SOLD_OUT','REMOVAL_REVIEW','ARCHIVED')),
  due_at TEXT NOT NULL,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_outcome TEXT,
  last_error TEXT,
  next_eligible_at TEXT NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  sold_out_since TEXT,
  sold_out_confirmations INTEGER NOT NULL DEFAULT 0,
  evidence_revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_revalidation_due ON inventory_revalidation_state(lifecycle_state,next_eligible_at,due_at);

CREATE TABLE inventory_revalidation_attempts (
  attempt_id TEXT PRIMARY KEY,
  listing_key TEXT NOT NULL REFERENCES inventory(listing_key),
  domain TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('AVAILABLE','SOLD_OUT','UNKNOWN','BLOCKED','ERROR')),
  http_status INTEGER,
  parser_version TEXT NOT NULL,
  observed_price_mxn REAL,
  evidence TEXT NOT NULL,
  error TEXT
);
CREATE INDEX idx_revalidation_attempts_listing ON inventory_revalidation_attempts(listing_key,started_at DESC);

CREATE TABLE revalidation_domain_state (
  domain TEXT PRIMARY KEY,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  last_attempt_at TEXT,
  last_outcome TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE inventory_removal_reviews (
  review_id TEXT PRIMARY KEY,
  listing_key TEXT NOT NULL REFERENCES inventory(listing_key),
  evidence_revision INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','KEEP_TRACKING','SNOOZE_30_DAYS','ARCHIVE')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  reason TEXT
);
CREATE UNIQUE INDEX idx_removal_reviews_one_pending ON inventory_removal_reviews(listing_key) WHERE status='PENDING';

CREATE TABLE customer_inventory_events (
  event_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('LISTING_PUBLISHED','BECAME_BUYABLE','PRICE_DROP')),
  listing_key TEXT NOT NULL REFERENCES inventory(listing_key),
  source_observation_id TEXT NOT NULL,
  routing_key TEXT NOT NULL CHECK(routing_key IN ('pokemon-main','pokemon-30th','delta-reign','magic-hobbit')),
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(delivery_status IN ('PENDING','DELIVERED','FAILED','SUPPRESSED')),
  acknowledged_at TEXT
);
CREATE INDEX idx_customer_events_delivery ON customer_inventory_events(delivery_status,created_at);

PRAGMA optimize;
