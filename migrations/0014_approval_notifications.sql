CREATE TABLE approval_notifications (
  evidence_revision TEXT PRIMARY KEY,
  asin TEXT NOT NULL REFERENCES amazon_watchlist(asin),
  verification_attempt_id INTEGER NOT NULL REFERENCES amazon_verification_attempts(id),
  status TEXT NOT NULL CHECK(status IN ('PENDING','DELIVERED','PENDING_MISSING_ROUTE')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  delivered_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_approval_notifications_pending ON approval_notifications(status,last_attempt_at);
PRAGMA optimize;
