-- No inferred historical costs or changes to existing inventory baselines.
CREATE TABLE search_budget_months (
  month TEXT PRIMARY KEY,
  opening_microusd INTEGER NOT NULL CHECK(opening_microusd >= 0),
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  reason TEXT NOT NULL
);
CREATE TABLE search_accounting (
  scan_id TEXT PRIMARY KEY REFERENCES scan_runs(id),
  month TEXT NOT NULL REFERENCES search_budget_months(month),
  reserved_microusd INTEGER NOT NULL CHECK(reserved_microusd > 0),
  estimated_microusd INTEGER CHECK(estimated_microusd >= 0),
  response_id TEXT,
  usage_json TEXT,
  web_calls INTEGER,
  pricing_version TEXT NOT NULL,
  settled_at TEXT,
  new_listings INTEGER CHECK(new_listings >= 0),
  restocks INTEGER CHECK(restocks >= 0),
  unchanged INTEGER CHECK(unchanged >= 0),
  yield_recorded_at TEXT
);
CREATE INDEX search_accounting_month ON search_accounting(month);
CREATE TABLE search_reviews (
  scan_id TEXT PRIMARY KEY REFERENCES scan_runs(id),
  triggered_at TEXT NOT NULL,
  consecutive_empty INTEGER NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  note TEXT
);
