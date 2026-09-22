CREATE TABLE amazon_browser_observations (
  id TEXT PRIMARY KEY,
  asin TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  collector_state TEXT NOT NULL,
  buying_options_shown INTEGER CHECK (buying_options_shown IN (0,1) OR buying_options_shown IS NULL),
  evidence_json TEXT NOT NULL
);
CREATE INDEX amazon_browser_observations_latest ON amazon_browser_observations(asin,observed_at DESC,received_at DESC,id DESC);
