ALTER TABLE customer_support ADD COLUMN consent_version TEXT;
ALTER TABLE customer_support ADD COLUMN consent_at TEXT;
-- Existing requests intentionally have no inferred consent.
