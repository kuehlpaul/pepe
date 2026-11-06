-- Personal Context Layer — initial schema

-- Durable facts about the user: preferences, decisions, project state, people, corrections.
CREATE TABLE memories (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('preference','fact','decision','project','person','correction','other')),
  topic         TEXT NOT NULL,              -- short subject line, one topic per memory
  content       TEXT NOT NULL,
  source        TEXT,                       -- URL, file, chat, agent name ...
  source_date   TEXT,                       -- when it was true/confirmed (NOT the save date); NULL if unknown
  confidence    TEXT NOT NULL DEFAULT 'confirmed' CHECK (confidence IN ('confirmed','inferred','uncertain')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','archived')),
  superseded_by TEXT REFERENCES memories(id),
  tags          TEXT NOT NULL DEFAULT '[]', -- JSON array
  created_by    TEXT,                       -- client/agent that wrote it
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_memories_status ON memories(status, updated_at DESC);
CREATE INDEX idx_memories_type ON memories(type);

-- Artifacts that outlast a chat: plans, specs, research, notes.
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','plan','spec','research','meeting','other')),
  project     TEXT,
  content     TEXT NOT NULL,                -- Markdown
  source      TEXT,
  tags        TEXT NOT NULL DEFAULT '[]',
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_documents_updated ON documents(updated_at DESC);

-- Reusable skills (SKILL.md style instructions) any agent can load.
CREATE TABLE skills (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  content     TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  version     TEXT,
  source      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Key/value settings: "about" profile and the operating guide.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Things that must never be stored, and hashes of forgotten content (prevents re-import).
CREATE TABLE exclusions (
  id         TEXT PRIMARY KEY,
  rule       TEXT NOT NULL,                 -- human-readable rule shown to agents
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE tombstones (
  content_hash TEXT PRIMARY KEY,
  forgotten_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Personal API tokens for clients without OAuth support. Only the SHA-256 hash is stored.
CREATE TABLE api_tokens (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  prefix       TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_used_at TEXT
);

-- Every write, so nothing an agent does is hidden.
CREATE TABLE activity (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor   TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT,
  detail  TEXT
);
CREATE INDEX idx_activity_at ON activity(at DESC);

INSERT INTO settings (key, value) VALUES
  ('about', 'Not set up yet. Edit this in the web UI: who you are, your role, current projects, how you like to work.'),
  ('guide', '# Agent Operating Guide

Version 0.1.0

## Where things live
- Memories: `remember` / `update_memory` (durable facts, preferences, decisions, project state)
- Documents: `save_document` (plans, specs, research, notes)
- Skills: `list_skills` / `get_skill`

## User preferences
Not recorded yet.

## Version history
- 0.1.0 — initial setup');
