CREATE TABLE cost_watch_alerts (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL,
 summary TEXT NOT NULL,
 created_at TEXT NOT NULL,
 lease_until TEXT,
 delivered_at TEXT
);
