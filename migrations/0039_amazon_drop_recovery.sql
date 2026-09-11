CREATE TABLE amazon_drop_jobs (
 id TEXT PRIMARY KEY, asin TEXT NOT NULL, window_start INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RESERVING','PENDING','RUNNING','COMPLETED','FAILED')),
 created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
 response_id TEXT, signal TEXT, evidence_json TEXT, error TEXT,
 reserved_microusd INTEGER NOT NULL DEFAULT 500000,
 UNIQUE(asin,window_start)
);
CREATE TABLE amazon_drop_check_leases (
 asin TEXT NOT NULL, window_start INTEGER NOT NULL, owner TEXT NOT NULL,
 expires_at INTEGER NOT NULL, completed_minute INTEGER,
 PRIMARY KEY(asin,window_start)
);
