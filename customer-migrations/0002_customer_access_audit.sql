ALTER TABLE customer_members ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_members ADD COLUMN updated_at TEXT;
ALTER TABLE customer_members ADD COLUMN updated_by TEXT;
ALTER TABLE customer_members ADD COLUMN change_reason TEXT;
CREATE TABLE customer_access_decisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 customer_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
 version INTEGER NOT NULL,
 decided_by TEXT NOT NULL,
 reason TEXT NOT NULL,
 decided_at TEXT NOT NULL
);
CREATE TRIGGER customer_access_audit AFTER UPDATE OF status ON customer_members
WHEN OLD.status!=NEW.status
BEGIN
 INSERT INTO customer_access_decisions(customer_id,status,version,decided_by,reason,decided_at)
 VALUES(NEW.id,NEW.status,NEW.version,NEW.updated_by,NEW.change_reason,NEW.updated_at);
END;
