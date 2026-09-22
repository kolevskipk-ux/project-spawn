CREATE TABLE amazon_browser_advisory_state (
 asin TEXT PRIMARY KEY,
 last_signal INTEGER NOT NULL DEFAULT 0,
 last_observed_at TEXT NOT NULL DEFAULT '',
 last_queued_at TEXT
);
CREATE TABLE amazon_browser_advisories (
 id TEXT PRIMARY KEY,
 asin TEXT NOT NULL,
 observation_id TEXT NOT NULL,
 observed_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DELIVERED','EXPIRED','SUPPRESSED')),
 claim_token TEXT,
 lease_until TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 delivered_at TEXT
);
CREATE INDEX amazon_browser_advisories_pending ON amazon_browser_advisories(asin,status,created_at DESC);
