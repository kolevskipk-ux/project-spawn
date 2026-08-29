ALTER TABLE monitoring_candidates ADD COLUMN review_eligible INTEGER NOT NULL DEFAULT 0 CHECK(review_eligible IN (0,1));
ALTER TABLE monitoring_candidates ADD COLUMN disposition TEXT CHECK(disposition IN ('visibility_only','hourly','five_minute'));
ALTER TABLE monitoring_candidates ADD COLUMN reviewed_by TEXT;
ALTER TABLE monitoring_candidates ADD COLUMN review_reason TEXT;
ALTER TABLE monitoring_candidates ADD COLUMN reviewed_at TEXT;
ALTER TABLE monitoring_candidates ADD COLUMN published_at TEXT;
ALTER TABLE amazon_watchlist ADD COLUMN poll_interval_minutes INTEGER NOT NULL DEFAULT 5 CHECK(poll_interval_minutes IN (5,60));

CREATE TABLE listing_publication_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL REFERENCES monitoring_candidates(candidate_id),
  decision TEXT NOT NULL CHECK(decision IN ('PUBLISHED','REJECTED')),
  disposition TEXT CHECK(disposition IN ('visibility_only','hourly','five_minute')),
  reason TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  publication_version TEXT
);
CREATE INDEX idx_listing_publication_decisions_candidate ON listing_publication_decisions(candidate_id,decided_at DESC);
INSERT INTO worker_state(key,value,updated_at) VALUES('listing_publication_version','1',CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO NOTHING;
UPDATE worker_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT),updated_at=CURRENT_TIMESTAMP WHERE key='amazon_catalog_version';
PRAGMA optimize;
