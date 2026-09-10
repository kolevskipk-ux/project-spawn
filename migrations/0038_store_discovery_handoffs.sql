CREATE TABLE store_discovery_handoffs (
 candidate_id TEXT PRIMARY KEY REFERENCES monitoring_candidates(candidate_id),
 store_id TEXT NOT NULL REFERENCES store_acquisitions(id),
 url TEXT NOT NULL,
 queued_at TEXT NOT NULL
);
