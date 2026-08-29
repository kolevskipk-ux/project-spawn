CREATE TABLE discovery_approval_notifications (
  candidate_id TEXT PRIMARY KEY REFERENCES monitoring_candidates(candidate_id),
  status TEXT NOT NULL CHECK(status IN ('PENDING','DELIVERED','PENDING_MISSING_ROUTE')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  delivered_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_discovery_approval_notifications_pending ON discovery_approval_notifications(status,last_attempt_at);
INSERT OR IGNORE INTO discovery_approval_notifications(candidate_id,status,created_at)
SELECT candidate_id,'PENDING',discovered_at FROM monitoring_candidates WHERE review_eligible=1 AND status='PENDING';
PRAGMA optimize;
