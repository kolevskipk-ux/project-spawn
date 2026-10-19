-- Additive review state and bounded dashboard access paths. No catalog/flag resets.
CREATE TABLE store_item_reviews (
 store_id TEXT NOT NULL REFERENCES store_acquisitions(id), url TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
 revision INTEGER NOT NULL, actor TEXT NOT NULL, reviewed_at TEXT NOT NULL,
 PRIMARY KEY(store_id,url)
);
CREATE INDEX store_acquisitions_status_id ON store_acquisitions(status,id);
CREATE INDEX store_catalog_runs_store_started ON store_catalog_runs(store_id,started_at DESC,id);
CREATE INDEX store_decisions_store_time ON store_acquisition_decisions(store_id,decided_at DESC,id);
CREATE INDEX store_catalog_import_pending ON store_catalog_items(store_id,imported_at,url);
CREATE INDEX monitoring_candidates_url_status ON monitoring_candidates(source_url,status);
CREATE INDEX inventory_alias_vendor_url ON inventory(lower(trim(retailer)),canonical_url);
CREATE TABLE store_import_jobs (
 store_id TEXT PRIMARY KEY REFERENCES store_acquisitions(id),
 cursor TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL CHECK(status IN ('QUEUED','COMPLETE','CANCELLED','ERROR')),
 requested_at TEXT NOT NULL, next_due_at TEXT NOT NULL, last_error TEXT
);
CREATE INDEX store_import_jobs_due ON store_import_jobs(status,next_due_at,store_id);
