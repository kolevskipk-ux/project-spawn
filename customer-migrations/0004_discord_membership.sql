CREATE TABLE customer_discord_links (
 customer_id TEXT PRIMARY KEY REFERENCES customer_members(id),
 discord_user_id TEXT NOT NULL UNIQUE,
 guild_id TEXT NOT NULL,
 membership_status TEXT NOT NULL DEFAULT 'UNKNOWN',
 checked_at TEXT, verified_at TEXT, roles_json TEXT NOT NULL DEFAULT '[]',
 linked_at TEXT NOT NULL
);
CREATE TABLE customer_discord_states (
 state_hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customer_members(id),
 expires_at TEXT NOT NULL, consumed_at TEXT
);
CREATE TABLE customer_terms_acceptances (
 customer_id TEXT NOT NULL REFERENCES customer_members(id),
 terms_version TEXT NOT NULL, accepted_at TEXT NOT NULL, adult_confirmed INTEGER NOT NULL CHECK(adult_confirmed=1),
 PRIMARY KEY(customer_id,terms_version)
);
CREATE TABLE customer_discord_role_sync (
 customer_id TEXT PRIMARY KEY REFERENCES customer_members(id),
 last_attempt_at TEXT, last_success_at TEXT, desired INTEGER NOT NULL DEFAULT 0,
 last_error TEXT
);
