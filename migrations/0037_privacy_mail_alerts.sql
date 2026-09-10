CREATE TABLE privacy_mail_alerts (
 id TEXT PRIMARY KEY,
 received_at TEXT NOT NULL,
 delivered_at TEXT,
 lease_until TEXT,
 attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX privacy_mail_alerts_pending ON privacy_mail_alerts(delivered_at,lease_until);
