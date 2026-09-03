ALTER TABLE inventory ADD COLUMN fulfilment_region_state TEXT NOT NULL DEFAULT 'CROSS_BORDER_UNVERIFIED' CHECK(fulfilment_region_state IN ('DOMESTIC','CROSS_BORDER_CONFIRMED','CROSS_BORDER_UNVERIFIED','DESTINATION_UNAVAILABLE'));
ALTER TABLE inventory ADD COLUMN retailer_country TEXT;
ALTER TABLE inventory ADD COLUMN ship_from_country TEXT;
ALTER TABLE inventory ADD COLUMN original_price REAL;
ALTER TABLE inventory ADD COLUMN original_currency TEXT;
ALTER TABLE inventory ADD COLUMN mexico_delivery_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK(mexico_delivery_status IN ('CONFIRMED','UNVERIFIED','UNAVAILABLE'));
ALTER TABLE inventory ADD COLUMN shipping_mxn REAL;
ALTER TABLE inventory ADD COLUMN import_cost_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(import_cost_status IN ('INCLUDED','EXCLUDED','UNKNOWN'));
ALTER TABLE inventory ADD COLUMN destination_checked_at TEXT;
ALTER TABLE inventory ADD COLUMN destination_fresh_until TEXT;

ALTER TABLE monitoring_candidates ADD COLUMN fulfilment_region_state TEXT NOT NULL DEFAULT 'CROSS_BORDER_UNVERIFIED' CHECK(fulfilment_region_state IN ('DOMESTIC','CROSS_BORDER_CONFIRMED','CROSS_BORDER_UNVERIFIED','DESTINATION_UNAVAILABLE'));
ALTER TABLE monitoring_candidates ADD COLUMN retailer_country TEXT;
ALTER TABLE monitoring_candidates ADD COLUMN ship_from_country TEXT;
ALTER TABLE monitoring_candidates ADD COLUMN original_price REAL;
ALTER TABLE monitoring_candidates ADD COLUMN original_currency TEXT;
ALTER TABLE monitoring_candidates ADD COLUMN mexico_delivery_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK(mexico_delivery_status IN ('CONFIRMED','UNVERIFIED','UNAVAILABLE'));
ALTER TABLE monitoring_candidates ADD COLUMN shipping_mxn REAL;
ALTER TABLE monitoring_candidates ADD COLUMN import_cost_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(import_cost_status IN ('INCLUDED','EXCLUDED','UNKNOWN'));
ALTER TABLE monitoring_candidates ADD COLUMN destination_checked_at TEXT;
ALTER TABLE monitoring_candidates ADD COLUMN destination_fresh_until TEXT;

UPDATE inventory SET fulfilment_region_state='DOMESTIC',retailer_country='MX',ship_from_country='MX',mexico_delivery_status='CONFIRMED' WHERE listing_key IN (SELECT source_listing_key FROM monitoring_candidates WHERE status='ACCEPTED');
UPDATE monitoring_candidates SET fulfilment_region_state='DOMESTIC',retailer_country='MX',ship_from_country='MX',mexico_delivery_status='CONFIRMED' WHERE status='ACCEPTED';
PRAGMA optimize;
