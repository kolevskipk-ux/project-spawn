INSERT INTO amazon_watchlist
  (asin, product_name, product_url, watch_category, language, priority, lane, status, source, first_discovered_at, last_discovered_at)
VALUES
  ('B0GXC89N66', 'Magic: The Gathering | The Hobbit Collector Booster Box', 'https://www.amazon.com.mx/dp/B0GXC89N66',
   'mtg_hobbit_collector_box', 'english', 'HIGH', 'normal', 'ACTIVE', 'operator_verified', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(asin) DO UPDATE SET
  product_name=excluded.product_name,
  product_url=excluded.product_url,
  watch_category=excluded.watch_category,
  language=excluded.language,
  priority=excluded.priority,
  lane=excluded.lane,
  status='ACTIVE',
  source='operator_verified',
  last_discovered_at=CURRENT_TIMESTAMP;

PRAGMA optimize;
