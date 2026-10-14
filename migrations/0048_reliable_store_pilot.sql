-- Additive enrollment; preserve all existing targets and monitoring baselines.
CREATE TABLE store_monitor_pilot (
 target_id TEXT PRIMARY KEY REFERENCES store_monitor_targets(id),
 enrolled_at TEXT NOT NULL,
 enrolled_by TEXT NOT NULL,
 reason TEXT NOT NULL
);
CREATE INDEX store_observations_target_latest
 ON store_monitor_observations(target_id,observed_at DESC);
CREATE TABLE customer_event_rejections (
 event_id TEXT PRIMARY KEY,
 reason TEXT NOT NULL,
 rejected_at TEXT NOT NULL
);
