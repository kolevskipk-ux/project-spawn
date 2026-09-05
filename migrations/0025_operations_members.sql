CREATE TABLE ops_members (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  role TEXT NOT NULL CHECK(role IN ('admin','viewer')),
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE ops_access_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  decided_at TEXT NOT NULL
);
