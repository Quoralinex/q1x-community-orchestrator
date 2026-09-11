CREATE TABLE document_versions (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  storage_revision INTEGER NOT NULL,
  scope_id TEXT,
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (kind, id, storage_revision)
);
CREATE TABLE document_heads (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  storage_revision INTEGER NOT NULL,
  scope_id TEXT,
  PRIMARY KEY (kind, id)
);
