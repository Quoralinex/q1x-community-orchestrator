import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveRuntimeHome } from './home.js';

export interface PutDocumentInput<T = unknown> {
  kind: string;
  id: string;
  scopeId: string | null;
  document: T;
}

interface HeadRow {
  storage_revision: number;
}

interface DocumentRow {
  document_json: string;
}

export class SqliteStore {
  readonly home: string;
  readonly databasePath: string;
  private readonly db: DatabaseSync;

  private constructor(home: string, databasePath: string, db: DatabaseSync) {
    this.home = home;
    this.databasePath = databasePath;
    this.db = db;
  }

  static open(homeInput?: string): SqliteStore {
    const home = resolveRuntimeHome(homeInput);
    mkdirSync(home, { recursive: true });
    const databasePath = join(home, 'state.sqlite');
    const db = new DatabaseSync(databasePath);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_versions (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        storage_revision INTEGER NOT NULL,
        scope_id TEXT,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (kind, id, storage_revision)
      );
      CREATE TABLE IF NOT EXISTS document_heads (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        storage_revision INTEGER NOT NULL,
        scope_id TEXT,
        PRIMARY KEY (kind, id),
        FOREIGN KEY (kind, id, storage_revision)
          REFERENCES document_versions(kind, id, storage_revision)
      );
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        programme_id TEXT NOT NULL,
        checkpoint_json TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runtime_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        scope_id TEXT,
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_document_heads_scope
        ON document_heads(scope_id, kind, id);
      CREATE INDEX IF NOT EXISTS idx_runtime_events_scope
        ON runtime_events(scope_id, sequence);
    `);
    return new SqliteStore(home, databasePath, db);
  }

  close(): void {
    this.db.close();
  }

  getHeadRevision(kind: string, id: string): number | undefined {
    const row = this.db.prepare(
      'SELECT storage_revision FROM document_heads WHERE kind = ? AND id = ?'
    ).get(kind, id) as HeadRow | undefined;
    return row?.storage_revision;
  }

  putDocument<T>({ kind, id, scopeId, document }: PutDocumentInput<T>): number {
    const nextRevision = (this.getHeadRevision(kind, id) ?? 0) + 1;
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.prepare(`
        INSERT INTO document_versions
          (kind, id, storage_revision, scope_id, document_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(kind, id, nextRevision, scopeId, JSON.stringify(document), now);
      this.db.prepare(`
        INSERT INTO document_heads (kind, id, storage_revision, scope_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(kind, id) DO UPDATE SET
          storage_revision = excluded.storage_revision,
          scope_id = excluded.scope_id
      `).run(kind, id, nextRevision, scopeId);
      this.db.exec('COMMIT;');
      return nextRevision;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  getDocument<T = unknown>(kind: string, id: string): T | undefined {
    const row = this.db.prepare(`
      SELECT v.document_json
      FROM document_heads h
      JOIN document_versions v
        ON v.kind = h.kind AND v.id = h.id AND v.storage_revision = h.storage_revision
      WHERE h.kind = ? AND h.id = ?
    `).get(kind, id) as DocumentRow | undefined;
    return row ? JSON.parse(row.document_json) as T : undefined;
  }

  listDocuments<T = unknown>(kind: string, scopeId?: string): T[] {
    const sql = scopeId === undefined
      ? `SELECT v.document_json FROM document_heads h
         JOIN document_versions v ON v.kind=h.kind AND v.id=h.id AND v.storage_revision=h.storage_revision
         WHERE h.kind=? ORDER BY h.id`
      : `SELECT v.document_json FROM document_heads h
         JOIN document_versions v ON v.kind=h.kind AND v.id=h.id AND v.storage_revision=h.storage_revision
         WHERE h.kind=? AND h.scope_id=? ORDER BY h.id`;
    const rows = (scopeId === undefined
      ? this.db.prepare(sql).all(kind)
      : this.db.prepare(sql).all(kind, scopeId)) as unknown as DocumentRow[];
    return rows.map(row => JSON.parse(row.document_json) as T);
  }

  appendEvent(eventType: string, subjectType: string, subjectId: string, scopeId: string | null, payload: unknown): void {
    this.db.prepare(`INSERT INTO runtime_events
      (event_type, subject_type, subject_id, scope_id, payload_json, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?)`
    ).run(eventType, subjectType, subjectId, scopeId, JSON.stringify(payload), new Date().toISOString());
  }
}
