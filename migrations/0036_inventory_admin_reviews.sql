CREATE TABLE inventory_admin_reviews (
 listing_key TEXT PRIMARY KEY REFERENCES inventory(listing_key),
 revision INTEGER NOT NULL DEFAULT 0,
 reviewed_at TEXT, reviewed_by TEXT, removed_at TEXT
);
CREATE TABLE inventory_admin_actions (
 id TEXT PRIMARY KEY, listing_key TEXT NOT NULL REFERENCES inventory(listing_key),
 action TEXT NOT NULL, actor TEXT NOT NULL, acted_at TEXT NOT NULL,
 revision INTEGER NOT NULL, details_json TEXT NOT NULL
);
