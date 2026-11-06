-- Lessons: mistakes agents made and what to do instead. Always loaded into get_context.
CREATE TABLE lessons (
  id          TEXT PRIMARY KEY,
  lesson      TEXT NOT NULL,                -- what to do / avoid next time, phrased as guidance
  context     TEXT,                         -- what happened (the mistake or correction)
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_lessons_status ON lessons(status, updated_at DESC);

-- Previous versions of documents: written before every update, so edits by any agent can be traced and restored.
CREATE TABLE document_revisions (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  edited_by   TEXT,                         -- who wrote THIS version
  edited_at   TEXT NOT NULL,                -- when THIS version was written
  replaced_by TEXT,                         -- who replaced it
  replaced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_revisions_doc ON document_revisions(document_id, replaced_at DESC);

-- Track who last edited a document (created_by stays the original author).
ALTER TABLE documents ADD COLUMN updated_by TEXT;
UPDATE documents SET updated_by = created_by;
