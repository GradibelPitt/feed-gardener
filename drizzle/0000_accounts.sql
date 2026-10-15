CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX account_sessions_user ON account_sessions(user_id);
--> statement-breakpoint
CREATE INDEX account_sessions_expiry ON account_sessions(expires_at);
--> statement-breakpoint
CREATE TABLE account_data (
  user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  data_key TEXT NOT NULL,
  value TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, data_key)
);
--> statement-breakpoint
CREATE TABLE account_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX account_limits_expiry ON account_limits(expires_at);
