CREATE TABLE store_acquisitions (
 id TEXT PRIMARY KEY,
 origin TEXT NOT NULL UNIQUE,
 retailer TEXT NOT NULL,
 vendor_key TEXT NOT NULL,
 marketplace INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','PAUSED')),
 revision INTEGER NOT NULL DEFAULT 1,
 categories_json TEXT NOT NULL DEFAULT '[]',
 refresh_hours INTEGER NOT NULL DEFAULT 6 CHECK(refresh_hours IN (6,12,24)),
 approved_by TEXT, approved_at TEXT,
 created_at TEXT NOT NULL,
 last_completed_at TEXT, next_due_at TEXT, last_tick_at TEXT,
 baseline_completed_at TEXT
);
CREATE TABLE store_catalog_runs (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES store_acquisitions(id),
 status TEXT NOT NULL CHECK(status IN ('RUNNING','COMPLETE','PARTIAL','BLOCKED','ERROR')),
 started_at TEXT NOT NULL, finished_at TEXT,
 started_by TEXT NOT NULL,
 robots_json TEXT NOT NULL DEFAULT 'null',
 note TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX one_store_catalog_run ON store_catalog_runs(store_id) WHERE status='RUNNING';
CREATE TABLE store_catalog_pages (
 run_id TEXT NOT NULL REFERENCES store_catalog_runs(id), url TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('ROBOTS','SITEMAP','FEED','PAGE')),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','DONE','FAILED','BLOCKED')),
 detail TEXT, PRIMARY KEY(run_id,url)
);
CREATE INDEX store_catalog_pending ON store_catalog_pages(run_id,state,kind);
CREATE TABLE store_catalog_items (
 store_id TEXT NOT NULL REFERENCES store_acquisitions(id), url TEXT NOT NULL,
 title TEXT NOT NULL, category TEXT,
 listing_json TEXT, evidence_note TEXT NOT NULL,
 first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
 first_run_id TEXT NOT NULL, last_run_id TEXT NOT NULL,
 imported_at TEXT, listing_key TEXT,
 PRIMARY KEY(store_id,url)
);
CREATE TABLE store_acquisition_decisions (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES store_acquisitions(id),
 action TEXT NOT NULL, actor TEXT NOT NULL, decided_at TEXT NOT NULL,
 revision INTEGER NOT NULL, details_json TEXT NOT NULL
);
