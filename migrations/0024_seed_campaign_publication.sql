CREATE TABLE seed_campaign_publications (
  campaign_id TEXT PRIMARY KEY REFERENCES seed_campaigns(campaign_id),
  item_count INTEGER NOT NULL CHECK(item_count > 0),
  disposition TEXT NOT NULL CHECK(disposition='visibility_only'),
  reason TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE
);

CREATE TABLE campaign_customer_events (
  event_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version=3),
  event_type TEXT NOT NULL CHECK(event_type='CAMPAIGN_PUBLISHED'),
  campaign_id TEXT NOT NULL REFERENCES seed_campaigns(campaign_id),
  routing_key TEXT NOT NULL CHECK(routing_key='pokemon-main'),
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(delivery_status IN ('PENDING','DELIVERED','FAILED','SUPPRESSED')),
  acknowledged_at TEXT
);
CREATE INDEX idx_campaign_customer_events_delivery ON campaign_customer_events(delivery_status,created_at);
PRAGMA optimize;
