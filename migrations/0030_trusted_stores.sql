CREATE TABLE trusted_store_rules (
 id TEXT PRIMARY KEY,
 origin TEXT NOT NULL,
 seller_key TEXT NOT NULL,
 category TEXT NOT NULL,
 source_candidate_id TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 evidence_json TEXT NOT NULL DEFAULT '{}',
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 revoked_by TEXT,
 revoked_at TEXT,
 UNIQUE(origin,seller_key,category)
);
CREATE TABLE trusted_store_attempts (
 id TEXT PRIMARY KEY,
 candidate_id TEXT NOT NULL,
 rule_id TEXT REFERENCES trusted_store_rules(id),
 attempted_at TEXT NOT NULL,
 outcome TEXT NOT NULL,
 details_json TEXT NOT NULL,
 admin_seen_at TEXT,
 admin_seen_by TEXT
);
CREATE INDEX trusted_store_attempts_candidate ON trusted_store_attempts(candidate_id,attempted_at DESC);
