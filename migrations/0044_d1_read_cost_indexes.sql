-- Additive indexes only: preserve inventory, queues, schedules and baselines.
CREATE INDEX IF NOT EXISTS monitoring_candidates_listing_status_latest
  ON monitoring_candidates(source_listing_key,status,discovered_at DESC);
CREATE INDEX IF NOT EXISTS amazon_watchlist_product_lifecycle
  ON amazon_watchlist(product_url,lifecycle_status,staging_enabled);
CREATE INDEX IF NOT EXISTS store_discovery_handoffs_store_url
  ON store_discovery_handoffs(store_id,url);
CREATE INDEX IF NOT EXISTS store_catalog_pending_kind_url
  ON store_catalog_pages(run_id,state,kind,url);
CREATE INDEX IF NOT EXISTS store_catalog_pending_priority
  ON store_catalog_pages(run_id,state,
    CASE WHEN kind='ROBOTS' THEN 0 WHEN kind='PAGE' AND (url LIKE '%/products/%' OR url LIKE '%/product/%' OR url LIKE '%/producto/%') THEN 1 WHEN kind='FEED' THEN 2 WHEN kind='SITEMAP' THEN 3 ELSE 4 END,url);
