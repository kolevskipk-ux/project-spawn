CREATE TABLE category_price_references (
  product_type TEXT NOT NULL,
  language TEXT NOT NULL,
  revision INTEGER NOT NULL,
  amount_mxn REAL NOT NULL CHECK(amount_mxn>0),
  source_type TEXT NOT NULL,
  source_note TEXT NOT NULL,
  source_url TEXT,
  observed_at TEXT,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  PRIMARY KEY(product_type,language,revision)
);
INSERT INTO category_price_references VALUES
 ('elite_trainer_box','english',1,1100,'operator_guideline','Philip approved the starting category reference; not official MSRP or observed launch evidence',NULL,NULL,'Philip','2026-09-09'),
 ('booster_bundle','english',1,629,'operator_guideline','Philip approved the starting category reference; standard six-pack bundle',NULL,NULL,'Philip','2026-09-09'),
 ('three_booster_blister','english',1,349,'operator_guideline','Philip approved the starting category reference; standard three-pack blister',NULL,NULL,'Philip','2026-09-09'),
 ('binder_collection','english',1,594,'operator_reported_retail','Philip reports Walmart price; exact listing evidence pending',NULL,NULL,'Philip','2026-09-09'),
 ('ultra_premium_collection','english',1,3370,'operator_reported_retail','Philip reports Walmart 30th Celebration Ultra Premium Day o Night price; page retrieval unavailable','https://www.walmart.com.mx/ip/cartas-coleccionables-pokemon-tcg-30th-celebration-ultra-premium-day-o-night-collection-en-ingles-varios-modelos-1-pieza/00019621415869',NULL,'Philip','2026-09-09'),
 ('poster_collection','english',1,329,'operator_reported_retail','Philip reports Walmart price; exact listing evidence pending; excludes premium poster collections',NULL,NULL,'Philip','2026-09-09'),
 ('premium_collection','english',1,749,'observed_retail','Walmart sold and shipped 30th Celebration Ditto Premium Collection in English; displayed price confirmed; no stock or official MSRP claim','https://www.walmart.com.mx/ip/cartas-coleccionables-pokemon-tcg-30th-celebration-ditto-premium-collection-en-ingles/00019621415836','2026-09-09','Philip','2026-09-09');
ALTER TABLE catch_inventory_observations ADD COLUMN source_product_id TEXT;
ALTER TABLE catch_inventory_observations ADD COLUMN target_diagnostic_id TEXT;
ALTER TABLE catch_inventory_observations ADD COLUMN inventory_diagnostic_id TEXT;
CREATE INDEX idx_inventory_diagnostic_asin ON inventory(retailer_sku,canonical_url);
