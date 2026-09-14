CREATE TABLE mercadolibre_operator_alerts (
 id TEXT PRIMARY KEY,
 item_id TEXT NOT NULL,
 observation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 delivered_at TEXT,
 lease_until TEXT,
 attempts INTEGER NOT NULL DEFAULT 0
);
