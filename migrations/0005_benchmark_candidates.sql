CREATE TABLE IF NOT EXISTS benchmark_candidates (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source = 'catch_em_all'),
  source_version TEXT NOT NULL,
  source_product_id TEXT NOT NULL,
  retailer TEXT NOT NULL CHECK (retailer = 'Amazon México'),
  product_name TEXT NOT NULL,
  asin TEXT NOT NULL,
  product_url TEXT NOT NULL,
  observed_state TEXT NOT NULL CHECK (observed_state IN ('PREORDER_BUYABLE', 'BUYABLE')),
  price_mxn REAL NOT NULL CHECK (price_mxn > 0),
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  sold_by_amazon INTEGER CHECK (sold_by_amazon IN (0, 1) OR sold_by_amazon IS NULL),
  fulfilled_by_amazon INTEGER CHECK (fulfilled_by_amazon IN (0, 1) OR fulfilled_by_amazon IS NULL),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_at TEXT,
  review_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_benchmark_candidates_review
  ON benchmark_candidates(review_status, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_benchmark_candidates_product
  ON benchmark_candidates(source_product_id, observed_at DESC);

PRAGMA optimize;
