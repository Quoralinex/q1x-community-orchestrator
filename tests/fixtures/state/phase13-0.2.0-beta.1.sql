CREATE TABLE runtime_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO runtime_metadata (key, value) VALUES ('state_schema_version', '1');
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
