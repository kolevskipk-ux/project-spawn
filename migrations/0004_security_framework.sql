CREATE TABLE IF NOT EXISTS scan_locks (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_cooldowns (
  name TEXT PRIMARY KEY,
  next_allowed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  request_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_security_events_occurred_at
  ON security_events(occurred_at DESC);

ALTER TABLE listing_feedback ADD COLUMN client_nonce TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_feedback_receipt
  ON listing_feedback(token, kind, client_nonce)
  WHERE client_nonce IS NOT NULL;

PRAGMA optimize;
