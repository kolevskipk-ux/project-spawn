CREATE TABLE IF NOT EXISTS vendors (vendor_key TEXT PRIMARY KEY, vendor_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUPPRESSED')), updated_at TEXT NOT NULL, updated_by TEXT, reason TEXT);
CREATE TABLE IF NOT EXISTS vendor_status_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, vendor_key TEXT NOT NULL, vendor_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ACTIVE','SUPPRESSED')), reported_at TEXT NOT NULL, reporter TEXT, reason TEXT);
CREATE INDEX IF NOT EXISTS idx_vendor_status ON vendors(status, vendor_key);
CREATE INDEX IF NOT EXISTS idx_vendor_audit ON vendor_status_audit(vendor_key, reported_at DESC);
CREATE TABLE IF NOT EXISTS monitoring_candidates (candidate_id TEXT PRIMARY KEY, source TEXT NOT NULL, source_url TEXT NOT NULL, source_listing_key TEXT NOT NULL, vendor TEXT NOT NULL, vendor_key TEXT NOT NULL, product_name TEXT NOT NULL, product_family TEXT NOT NULL, print_series TEXT NOT NULL, language TEXT NOT NULL, retailer_sku TEXT, observed_price_mxn REAL, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED')), discovered_at TEXT NOT NULL, UNIQUE(vendor_key, source_url));
ALTER TABLE inventory ADD COLUMN print_series TEXT;
UPDATE inventory SET print_series = CASE watch_category WHEN '30th_celebration' THEN '30th Celebration' WHEN 'ascended_heroes' THEN 'Ascended Heroes' WHEN 'delta_reign' THEN 'Delta Reign' ELSE watch_category END WHERE print_series IS NULL;
PRAGMA optimize;
