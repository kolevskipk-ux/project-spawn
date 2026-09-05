CREATE TABLE customer_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  created_at TEXT NOT NULL
);
CREATE TABLE customer_rate_limits (
  subject TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  requests INTEGER NOT NULL
);
-- Deliberately separate from raw discovery and operator records.
-- This pilot contains synthetic listings; production publication wiring is a separate release.
CREATE TABLE customer_listings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  set_name TEXT NOT NULL,
  retailer TEXT NOT NULL,
  language TEXT NOT NULL,
  price_mxn REAL,
  availability TEXT NOT NULL CHECK(availability IN ('available','sold_out','unknown')),
  observed_at TEXT NOT NULL,
  publication_state TEXT NOT NULL CHECK(publication_state IN ('PUBLISHED','PENDING','WITHDRAWN'))
);
CREATE INDEX customer_listings_publication ON customer_listings(publication_state, title);
