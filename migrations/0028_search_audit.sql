-- Independent of scan_runs so rejected and pre-insert attempts are visible.
CREATE TABLE search_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details_json TEXT NOT NULL,
  details_sha256 TEXT NOT NULL,
  truncated INTEGER NOT NULL CHECK(truncated IN (0,1))
);
CREATE INDEX search_audit_scan ON search_audit_events(scan_id,id);
CREATE TRIGGER search_audit_no_update BEFORE UPDATE ON search_audit_events
BEGIN SELECT RAISE(ABORT,'Search audit events are append-only'); END;
CREATE TRIGGER search_audit_no_delete BEFORE DELETE ON search_audit_events
BEGIN SELECT RAISE(ABORT,'Search audit events are append-only'); END;
