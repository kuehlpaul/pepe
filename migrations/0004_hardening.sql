-- 0004: hardening after the isolation audit.

-- Bumped on every password change/reset so older session cookies stop working.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;

-- Instance-wide values that are not per user, e.g. which account owns grants issued before accounts existed.
CREATE TABLE instance (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
