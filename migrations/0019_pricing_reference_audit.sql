CREATE TABLE pricing_reference_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  prior_json TEXT NOT NULL,
  resulting_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL
);
CREATE INDEX idx_pricing_reference_decisions_product ON pricing_reference_decisions(product_id,decided_at DESC);
PRAGMA optimize;
