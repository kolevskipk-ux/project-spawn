CREATE TABLE amazon_watchlist_v2 (
  asin TEXT PRIMARY KEY CHECK(length(asin)=10),
  canonical_product_id TEXT,
  product_name TEXT NOT NULL,
  product_url TEXT NOT NULL UNIQUE,
  watch_category TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'unknown',
  priority TEXT NOT NULL DEFAULT 'HIGH' CHECK(priority IN ('BOSS','HIGH','NORMAL')),
  lane TEXT NOT NULL DEFAULT 'normal' CHECK(lane IN ('priority','normal')),
  lifecycle_status TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK(lifecycle_status IN ('DISCOVERED','VERIFIED','APPROVED','PUBLISHED','REJECTED','SUSPENDED')),
  routing_key TEXT CHECK(routing_key IN ('pokemon-main','delta-reign','magic-hobbit')),
  alert_on_initial_buyable INTEGER NOT NULL DEFAULT 0 CHECK(alert_on_initial_buyable IN (0,1)),
  source TEXT NOT NULL,
  evidence TEXT,
  approved_by TEXT,
  approval_reason TEXT,
  approved_at TEXT,
  first_discovered_at TEXT NOT NULL,
  last_discovered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(lifecycle_status != 'PUBLISHED' OR (canonical_product_id IS NOT NULL AND routing_key IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

INSERT INTO amazon_watchlist_v2
  (asin,canonical_product_id,product_name,product_url,watch_category,language,priority,lane,lifecycle_status,routing_key,
   alert_on_initial_buyable,source,evidence,approved_by,approval_reason,approved_at,first_discovered_at,last_discovered_at,updated_at)
SELECT asin,
  CASE asin
    WHEN 'B0H77VYKSM' THEN '30-en-upc-day' WHEN 'B0H77XNKKK' THEN '30-en-upc-night'
    WHEN 'B0H784PD4X' THEN '30-en-upc-random' WHEN 'B0H78BB9TY' THEN '30-en-etb'
    WHEN 'B0H783FY5Z' THEN '30-en-booster-bundle' WHEN 'B0H77W4411' THEN '30-en-poster'
    WHEN 'B0H7818YHY' THEN '30-en-binder' WHEN 'B0H784PJ49' THEN '30-en-tin'
    WHEN 'B0H77XCW4M' THEN '30-en-figure-mew' WHEN 'B0H786SFFS' THEN '30-en-figure-mewtwo'
    WHEN 'B0H77VZBX4' THEN '30-en-tech-sticker' WHEN 'B0H786LQ7Z' THEN '30-en-mini-tin-night'
    WHEN 'B0H7817G9M' THEN '30-en-sylveon-box' WHEN 'B0H786RZD9' THEN '30-en-umbreon-deck'
    WHEN 'B0GXC89N66' THEN 'mtg-hobbit-en-collector-booster-box' END,
  product_name,product_url,watch_category,
  CASE WHEN asin='B0GXC89N66' THEN 'english' ELSE language END,
  priority,lane,'PUBLISHED',
  CASE WHEN watch_category='mtg_hobbit_collector_box' THEN 'magic-hobbit' ELSE 'pokemon-main' END,
  CASE WHEN asin='B0GXC89N66' THEN 1 ELSE 0 END,
  source,'Legacy production identity reviewed during 2026-08-27 baseline','operator:philip',
  'Approved Amazon baseline and lane review','2026-08-27T23:00:00.000Z',first_discovered_at,last_discovered_at,CURRENT_TIMESTAMP
FROM amazon_watchlist WHERE status='ACTIVE';

INSERT INTO amazon_watchlist_v2
  (asin,canonical_product_id,product_name,product_url,watch_category,language,priority,lane,lifecycle_status,routing_key,
   alert_on_initial_buyable,source,evidence,approved_by,approval_reason,approved_at,first_discovered_at,last_discovered_at,updated_at)
VALUES
 ('B0HG3MQDWP','delta-reign-en-etb','Delta Reign Elite Trainer Box','https://www.amazon.com.mx/dp/B0HG3MQDWP','delta_reign','english','BOSS','priority','PUBLISHED','delta-reign',1,'operator_verified','Operator-supplied Amazon Mexico ASIN and exact product identity','operator:philip','Approved priority lane','2026-08-27T23:00:00.000Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('B0HG3RVZLW','delta-reign-en-booster-bundle','Delta Reign Booster Bundle','https://www.amazon.com.mx/dp/B0HG3RVZLW','delta_reign','english','HIGH','normal','PUBLISHED','delta-reign',1,'operator_verified','Operator-supplied Amazon Mexico ASIN and exact product identity','operator:philip','Approved normal lane','2026-08-27T23:00:00.000Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('B0HG3JBNBN','delta-reign-en-three-booster-blister','Delta Reign Three Booster Blister','https://www.amazon.com.mx/dp/B0HG3JBNBN','delta_reign','english','HIGH','normal','PUBLISHED','delta-reign',1,'operator_verified','Operator-supplied Amazon Mexico ASIN and exact product identity','operator:philip','Approved normal lane','2026-08-27T23:00:00.000Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
 ('B0HG47DGH4','delta-reign-en-build-battle-box','Delta Reign Build & Battle Box','https://www.amazon.com.mx/dp/B0HG47DGH4','delta_reign','english','HIGH','normal','PUBLISHED','delta-reign',1,'operator_verified','Operator-supplied Amazon Mexico ASIN and exact product identity','operator:philip','Approved normal lane','2026-08-27T23:00:00.000Z',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

DROP TABLE amazon_watchlist;
ALTER TABLE amazon_watchlist_v2 RENAME TO amazon_watchlist;
CREATE INDEX idx_amazon_watchlist_lifecycle ON amazon_watchlist(lifecycle_status,lane,priority);
CREATE INDEX idx_amazon_watchlist_updated ON amazon_watchlist(updated_at);

INSERT INTO worker_state(key,value,updated_at) VALUES
 ('amazon_catalog_version','1',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP;

PRAGMA optimize;
