CREATE TABLE walmart_browser_observations (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('available','sold_out','unknown','blocked','error')),
  price_mxn REAL,
  seller TEXT,
  postcode TEXT,
  evidence_json TEXT NOT NULL
);
CREATE INDEX walmart_browser_item_time ON walmart_browser_observations(item_id,observed_at DESC);
