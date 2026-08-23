CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  watch_category TEXT NOT NULL,
  product_type TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'unknown',
  amazon_launch_mxn REAL,
  amazon_source_url TEXT,
  amazon_captured_at TEXT,
  amazon_confidence TEXT CHECK (amazon_confidence IN ('exact', 'strong_proxy', 'estimated_range')),
  collectr_usd REAL,
  collectr_source_url TEXT,
  collectr_captured_at TEXT,
  usd_mxn_rate REAL,
  updated_at TEXT NOT NULL
);

ALTER TABLE inventory ADD COLUMN product_id TEXT REFERENCES products(id);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_last_seen_status ON inventory(last_seen_at DESC, status);
