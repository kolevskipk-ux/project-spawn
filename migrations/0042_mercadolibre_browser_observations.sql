CREATE TABLE mercadolibre_browser_observations (
 id TEXT PRIMARY KEY,
 item_id TEXT NOT NULL,
 observed_at TEXT NOT NULL,
 received_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('unknown','blocked','error','available','sold_out')),
 page_availability TEXT CHECK(page_availability IS NULL OR page_availability='sold_out'),
 price_mxn REAL,
 seller_id TEXT,
 evidence_json TEXT NOT NULL
);
CREATE INDEX mercadolibre_browser_item_time ON mercadolibre_browser_observations(item_id,observed_at DESC);
