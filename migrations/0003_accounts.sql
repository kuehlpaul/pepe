-- 0003: accounts, waitlist, invites. Every record is owned by a user.
-- Existing single-owner data is tagged 'owner' and claimed by the admin account on first sign-up.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,                 -- lowercased, trimmed
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,                        -- pbkdf2$<iterations>$<salt>$<hash>
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  invite_id     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT
);

-- Public sign-ups. Nothing here grants access; the admin turns an entry into an invite.
CREATE TABLE waitlist (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  reason     TEXT,                                    -- what they want to use it for, which agents
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invited','joined','declined')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Invite codes. A code is the only way to create an account (except the configured admin email).
CREATE TABLE invites (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  email      TEXT,                                    -- if set, only this email can redeem it
  note       TEXT,
  max_uses   INTEGER NOT NULL DEFAULT 1,
  uses       INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  revoked_at TEXT
);

-- One-time password reset links (admin-issued, or self-service when email sending is configured).
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ---------------------------------------------------------------- ownership columns
-- DEFAULT 'owner' only exists so existing rows get a value; every write in src/store.ts binds user_id explicitly.
ALTER TABLE memories ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
CREATE INDEX idx_memories_user ON memories(user_id, status, updated_at DESC);

ALTER TABLE documents ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
CREATE INDEX idx_documents_user ON documents(user_id, updated_at DESC);

ALTER TABLE document_revisions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';

ALTER TABLE lessons ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
CREATE INDEX idx_lessons_user ON lessons(user_id, status, updated_at DESC);

ALTER TABLE exclusions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
CREATE INDEX idx_exclusions_user ON exclusions(user_id);

ALTER TABLE api_tokens ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);

ALTER TABLE activity ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
CREATE INDEX idx_activity_user ON activity(user_id, at DESC);

-- skills: UNIQUE(name) becomes UNIQUE(user_id, name)
CREATE TABLE skills_v2 (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  content     TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  version     TEXT,
  source      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, name)
);
INSERT INTO skills_v2 (id, user_id, name, description, content, enabled, version, source, created_at, updated_at)
  SELECT id, 'owner', name, description, content, enabled, version, source, created_at, updated_at FROM skills;
DROP TABLE skills;
ALTER TABLE skills_v2 RENAME TO skills;

-- settings: PRIMARY KEY (key) becomes (user_id, key)
CREATE TABLE settings_v2 (
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, key)
);
INSERT INTO settings_v2 (user_id, key, value, updated_at) SELECT 'owner', key, value, updated_at FROM settings;
DROP TABLE settings;
ALTER TABLE settings_v2 RENAME TO settings;

-- tombstones: PRIMARY KEY (content_hash) becomes (user_id, content_hash)
CREATE TABLE tombstones_v2 (
  user_id      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  forgotten_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, content_hash)
);
INSERT INTO tombstones_v2 (user_id, content_hash, forgotten_at) SELECT 'owner', content_hash, forgotten_at FROM tombstones;
DROP TABLE tombstones;
ALTER TABLE tombstones_v2 RENAME TO tombstones;
