CREATE TABLE customer_support (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer_members(id),
  kind TEXT NOT NULL CHECK(kind IN ('access','account_removal','general')),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(delivery_status IN ('PENDING','SENDING','SENT','FAILED')),
  delivery_token TEXT,
  last_attempt_at TEXT,
  delivered_at TEXT,
  last_error TEXT,
  attempted_by TEXT
);
CREATE INDEX customer_support_member_time ON customer_support(customer_id,created_at);
CREATE INDEX customer_support_delivery ON customer_support(delivery_status,created_at);
