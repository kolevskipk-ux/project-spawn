-- Permanent diagnostic identities, independent of mutable product metadata.
-- Retain mappings if a source row is removed and later recreated.
CREATE TABLE inventory_diagnostic_ids (
  source TEXT NOT NULL CHECK(source IN ('inventory','amazon')),
  source_key TEXT NOT NULL,
  diagnostic_id TEXT NOT NULL UNIQUE DEFAULT (
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    substr('89ab',1 + (random() & 3),1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))
  ),
  PRIMARY KEY(source,source_key)
);
INSERT INTO inventory_diagnostic_ids(source,source_key) SELECT 'inventory',listing_key FROM inventory;
INSERT INTO inventory_diagnostic_ids(source,source_key) SELECT 'amazon',asin FROM amazon_watchlist;
CREATE TRIGGER inventory_diagnostic_id_insert AFTER INSERT ON inventory BEGIN
  INSERT OR IGNORE INTO inventory_diagnostic_ids(source,source_key) VALUES('inventory',NEW.listing_key);
END;
CREATE TRIGGER amazon_diagnostic_id_insert AFTER INSERT ON amazon_watchlist BEGIN
  INSERT OR IGNORE INTO inventory_diagnostic_ids(source,source_key) VALUES('amazon',NEW.asin);
END;
