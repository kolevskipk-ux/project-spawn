-- Training fixtures ONLY for the separate garfield-operations-staging database.
-- These records are synthetic, not retailer observations. No external delivery is configured.
INSERT OR IGNORE INTO vendors(vendor_key,vendor_name,status,updated_at,updated_by,reason)
VALUES('training-store','Training store (sample)','ACTIVE',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'staging:fixture','Synthetic data for the administrator pilot');

INSERT OR IGNORE INTO monitoring_candidates(candidate_id,source,source_url,source_listing_key,vendor,vendor_key,product_name,product_family,print_series,language,observed_price_mxn,discovered_at,review_eligible,fulfilment_region_state)
VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','staging_fixture','https://example.com/?garfield-training=review-1','training-review-1','Training store (sample)','training-store','SAMPLE — Delta Reign review exercise','pokemon_tcg','Delta Reign','english',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),1,'CROSS_BORDER_UNVERIFIED');

INSERT OR IGNORE INTO monitoring_candidates(candidate_id,source,source_url,source_listing_key,vendor,vendor_key,product_name,product_family,print_series,language,observed_price_mxn,discovered_at,review_eligible,fulfilment_region_state)
VALUES('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','staging_fixture','https://example.com/?garfield-training=review-2','training-review-2','Training store (sample)','training-store','SAMPLE — 30th Anniversary review exercise','pokemon_tcg','30th Celebration','english',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),1,'CROSS_BORDER_UNVERIFIED');

INSERT OR IGNORE INTO inventory(listing_key,canonical_url,retailer,title,watch_category,first_seen_at,last_seen_at,status,language,language_evidence,print_series)
VALUES('training-inventory-1','https://example.com/?garfield-training=inventory','Training store (sample)','SAMPLE — Inventory training record','pokemon_tcg',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'unknown','english','Synthetic training record; no real product evidence','Delta Reign');
