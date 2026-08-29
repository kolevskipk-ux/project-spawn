ALTER TABLE amazon_watchlist ADD COLUMN routing_key_v2 TEXT CHECK(routing_key_v2 IN ('pokemon-main','pokemon-30th','delta-reign','magic-hobbit'));
ALTER TABLE amazon_watchlist ADD COLUMN staging_enabled INTEGER NOT NULL DEFAULT 0 CHECK(staging_enabled IN (0,1));
ALTER TABLE amazon_watchlist ADD COLUMN staged_at TEXT;
UPDATE amazon_watchlist SET routing_key_v2=CASE
  WHEN watch_category='30th_celebration' THEN 'pokemon-30th'
  WHEN watch_category='delta_reign' THEN 'delta-reign'
  WHEN watch_category='mtg_hobbit_collector_box' THEN 'magic-hobbit'
  ELSE 'pokemon-main' END;

ALTER TABLE amazon_verification_attempts ADD COLUMN proposed_routing_key_v2 TEXT CHECK(proposed_routing_key_v2 IN ('pokemon-main','pokemon-30th','delta-reign','magic-hobbit'));
UPDATE amazon_verification_attempts SET proposed_routing_key_v2=CASE
  WHEN watch_category='30th_celebration' THEN 'pokemon-30th'
  WHEN watch_category='delta_reign' THEN 'delta-reign'
  WHEN watch_category='mtg_hobbit_collector_box' THEN 'magic-hobbit'
  ELSE 'pokemon-main' END;

ALTER TABLE monitoring_candidates ADD COLUMN routing_key TEXT CHECK(routing_key IN ('pokemon-main','pokemon-30th','delta-reign','magic-hobbit'));
UPDATE monitoring_candidates SET routing_key=CASE
  WHEN lower(product_family) LIKE '%30th%' OR lower(product_name) LIKE '%30th%' THEN 'pokemon-30th'
  WHEN lower(product_family) LIKE '%delta reign%' OR lower(product_name) LIKE '%delta reign%' THEN 'delta-reign'
  WHEN lower(product_family) LIKE '%hobbit%' OR lower(product_name) LIKE '%hobbit%' THEN 'magic-hobbit'
  WHEN lower(product_family) LIKE '%pokemon%' OR lower(product_name) LIKE '%pokemon%' THEN 'pokemon-main'
  ELSE NULL END;

UPDATE worker_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT),updated_at=CURRENT_TIMESTAMP WHERE key='amazon_catalog_version';
UPDATE worker_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT),updated_at=CURRENT_TIMESTAMP WHERE key='listing_publication_version';
PRAGMA optimize;
