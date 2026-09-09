ALTER TABLE store_acquisitions ADD COLUMN policy_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE store_acquisitions ADD COLUMN announced_at TEXT;
CREATE TABLE store_monitor_targets (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES store_acquisitions(id),
 url TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL,
 priority TEXT NOT NULL DEFAULT 'regular' CHECK(priority IN ('hot','warm','regular')),
 cadence_minutes INTEGER NOT NULL DEFAULT 60 CHECK(cadence_minutes IN (5,30,60)),
 baseline INTEGER NOT NULL DEFAULT 1, routing_key TEXT NOT NULL,
 created_at TEXT NOT NULL, next_due_at TEXT NOT NULL,
 lease_id TEXT, lease_until TEXT, last_attempt_at TEXT, last_observed_at TEXT,
 state TEXT NOT NULL DEFAULT 'unknown', price_mxn REAL, failures INTEGER NOT NULL DEFAULT 0,
 acknowledgement_at TEXT, last_receipt TEXT, new_notice_at TEXT,
 UNIQUE(store_id,url)
);
CREATE INDEX store_monitor_due ON store_monitor_targets(next_due_at,lease_until);
CREATE TABLE store_monitor_observations (
 receipt_id TEXT PRIMARY KEY, target_id TEXT NOT NULL REFERENCES store_monitor_targets(id),
 observed_at TEXT NOT NULL, state TEXT NOT NULL, price_mxn REAL, evidence TEXT NOT NULL
);
CREATE TABLE store_customer_events (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL, target_id TEXT,
 kind TEXT NOT NULL CHECK(kind IN ('STORE_TRACKING','NEW_INVENTORY','HUNT_UPDATE')),
 routing_key TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
 due_at TEXT NOT NULL, delivered_at TEXT, expired_at TEXT, lease_id TEXT, lease_until TEXT,
 attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX store_events_due ON store_customer_events(delivered_at,due_at);
