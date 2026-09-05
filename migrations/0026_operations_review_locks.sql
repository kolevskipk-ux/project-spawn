CREATE TABLE ops_review_locks (
  resource TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
