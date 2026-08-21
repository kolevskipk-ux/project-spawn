CREATE TABLE IF NOT EXISTS scan_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('cron', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  config_version TEXT NOT NULL,
  model TEXT NOT NULL,
  result_json TEXT,
  result_hash TEXT,
  discord_message_id TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_runs_started_at
  ON scan_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS worker_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

