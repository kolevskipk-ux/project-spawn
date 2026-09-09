ALTER TABLE trusted_store_rules ADD COLUMN include_pending INTEGER NOT NULL DEFAULT 0 CHECK(include_pending IN (0,1));
ALTER TABLE trusted_store_rules ADD COLUMN all_sets INTEGER NOT NULL DEFAULT 0 CHECK(all_sets IN (0,1));
ALTER TABLE trusted_store_rules ADD COLUMN policy_updated_at TEXT;
ALTER TABLE trusted_store_rules ADD COLUMN policy_updated_by TEXT;
ALTER TABLE monitoring_candidates ADD COLUMN automatic_baseline INTEGER NOT NULL DEFAULT 0;
ALTER TABLE amazon_watchlist ADD COLUMN automatic_baseline INTEGER NOT NULL DEFAULT 0;
CREATE TABLE amazon_approval_digests (
 digest_date TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload_json TEXT NOT NULL,
 delivered_at TEXT, lease_id TEXT, lease_until TEXT, last_error TEXT
);
