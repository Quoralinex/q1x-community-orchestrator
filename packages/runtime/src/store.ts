import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveRuntimeHome } from './home.js';
import { RuntimeError } from './errors.js';
import { CURRENT_STATE_SCHEMA_VERSION, classifyStateSchema } from './state-schema.js';
import type { ExternalOperationState, OperationJournalEntry } from './operation-journal.js';

export interface HeadPointer {
  kind: string;
  id: string;
  storageRevision: number;
  scopeId: string | null;
}

export interface StoredCheckpoint<T = unknown> {
  checkpoint: T;
  snapshot: HeadPointer[];
}

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

interface ScopeRow { scope_id: string | null; }
interface HeadPointerRow { kind: string; id: string; storage_revision: number; scope_id: string | null; }
interface CheckpointRow { checkpoint_json: string; snapshot_json: string; }
interface MetadataRow { value: string; }
interface ExternalOperationRow {
  id: string; kind: OperationJournalEntry['kind']; subject_id: string; retry_safe: number;
  state: ExternalOperationState; metadata_json: string; created_at: string; updated_at: string;
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
    try {
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec('PRAGMA busy_timeout = 5000;');
      db.exec('CREATE TABLE IF NOT EXISTS runtime_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
      const metadata = db.prepare("SELECT value FROM runtime_metadata WHERE key = 'state_schema_version'").get() as MetadataRow | undefined;
      if (!metadata) {
        db.prepare('INSERT INTO runtime_metadata (key, value) VALUES (?, ?)').run(
          'state_schema_version', String(CURRENT_STATE_SCHEMA_VERSION)
        );
      } else {
        const version = Number(metadata.value);
        const classification = classifyStateSchema(version);
        if (classification === 'future') {
          throw new RuntimeError('INCOMPATIBLE_STATE', `Unsupported runtime state schema version: ${metadata.value}`);
        }
        if (classification === 'upgradeable') {
          db.prepare("UPDATE runtime_metadata SET value = ? WHERE key = 'state_schema_version'").run(
            String(CURRENT_STATE_SCHEMA_VERSION)
          );
        }
      }
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
        CREATE TABLE IF NOT EXISTS external_operations (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          subject_id TEXT NOT NULL,
          retry_safe INTEGER NOT NULL CHECK (retry_safe IN (0, 1)),
          state TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_external_operations_state
          ON external_operations(state, updated_at, id);
      `);
      const store = new SqliteStore(home, databasePath, db);
      const integrity = store.verifyIntegrity();
      if (!integrity.ok) {
        store.close();
        throw new RuntimeError('STORAGE_ERROR', `SQLite integrity check failed: ${integrity.message}`);
      }
      return store;
    } catch (error) {
      try { db.close(); } catch { /* already closed */ }
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  getStateSchemaVersion(): number {
    const row = this.db.prepare("SELECT value FROM runtime_metadata WHERE key = 'state_schema_version'").get() as MetadataRow | undefined;
    if (!row) throw new RuntimeError('INCOMPATIBLE_STATE', 'Runtime state schema marker is missing');
    const version = Number(row.value);
    if (!Number.isInteger(version)) throw new RuntimeError('INCOMPATIBLE_STATE', 'Runtime state schema marker is invalid');
    return version;
  }

  verifyIntegrity(): { ok: boolean; message: string } {
    const row = this.db.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined;
    const message = String(row ? Object.values(row)[0] ?? 'unknown' : 'unknown');
    return { ok: message === 'ok', message };
  }

  getHeadRevision(kind: string, id: string): number | undefined {
    const row = this.db.prepare(
      'SELECT storage_revision FROM document_heads WHERE kind = ? AND id = ?'
    ).get(kind, id) as HeadRow | undefined;
    return row?.storage_revision;
  }

  getDocumentScope(kind: string, id: string): string | null | undefined {
    const row = this.db.prepare(
      'SELECT scope_id FROM document_heads WHERE kind = ? AND id = ?'
    ).get(kind, id) as ScopeRow | undefined;
    return row?.scope_id;
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

  captureScopeHeads(scopeId: string): HeadPointer[] {
    const rows = this.db.prepare(
      'SELECT kind, id, storage_revision, scope_id FROM document_heads WHERE scope_id = ? ORDER BY kind, id'
    ).all(scopeId) as unknown as HeadPointerRow[];
    return rows.map(row => ({ kind: row.kind, id: row.id, storageRevision: row.storage_revision, scopeId: row.scope_id }));
  }

  saveCheckpoint<T>(id: string, programmeId: string, checkpoint: T, snapshot: HeadPointer[]): void {
    this.db.prepare(`INSERT INTO checkpoints
      (id, programme_id, checkpoint_json, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(id, programmeId, JSON.stringify(checkpoint), JSON.stringify(snapshot), new Date().toISOString());
  }

  getCheckpoint<T = unknown>(id: string): StoredCheckpoint<T> | undefined {
    const row = this.db.prepare('SELECT checkpoint_json, snapshot_json FROM checkpoints WHERE id = ?').get(id) as CheckpointRow | undefined;
    return row ? { checkpoint: JSON.parse(row.checkpoint_json) as T, snapshot: JSON.parse(row.snapshot_json) as HeadPointer[] } : undefined;
  }

  listCheckpoints<T = unknown>(programmeId?: string): T[] {
    const rows = (programmeId === undefined
      ? this.db.prepare('SELECT checkpoint_json FROM checkpoints ORDER BY created_at, id').all()
      : this.db.prepare('SELECT checkpoint_json FROM checkpoints WHERE programme_id = ? ORDER BY created_at, id').all(programmeId)) as unknown as { checkpoint_json: string }[];
    return rows.map(row => JSON.parse(row.checkpoint_json) as T);
  }

  restoreScopeHeads(scopeId: string, snapshot: HeadPointer[]): void {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.prepare('DELETE FROM document_heads WHERE scope_id = ?').run(scopeId);
      const insert = this.db.prepare('INSERT INTO document_heads (kind, id, storage_revision, scope_id) VALUES (?, ?, ?, ?)');
      for (const head of snapshot) insert.run(head.kind, head.id, head.storageRevision, head.scopeId);
      this.db.exec('COMMIT;');
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }


  insertExternalOperation(entry: OperationJournalEntry): void {
    try {
      this.db.prepare(`INSERT INTO external_operations
        (id, kind, subject_id, retry_safe, state, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(entry.id, entry.kind, entry.subjectId, entry.retrySafe ? 1 : 0, entry.state,
        JSON.stringify(entry.metadata), entry.createdAt, entry.updatedAt);
    } catch (error) {
      if (String(error).includes('UNIQUE constraint failed')) {
        throw new RuntimeError('EXECUTION_CONFLICT', `External operation already exists: ${entry.id}`);
      }
      throw error;
    }
  }

  getExternalOperation(id: string): OperationJournalEntry | undefined {
    const row = this.db.prepare('SELECT * FROM external_operations WHERE id = ?').get(id) as ExternalOperationRow | undefined;
    return row ? this.externalOperationFromRow(row) : undefined;
  }

  listExternalOperations(): OperationJournalEntry[] {
    const rows = this.db.prepare('SELECT * FROM external_operations ORDER BY created_at, id').all() as unknown as ExternalOperationRow[];
    return rows.map(row => this.externalOperationFromRow(row));
  }

  transitionExternalOperation(
    id: string,
    expectedStates: readonly ExternalOperationState[],
    state: ExternalOperationState,
    metadata?: Record<string, unknown>
  ): OperationJournalEntry {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const current = this.getExternalOperation(id);
      if (!current) throw new RuntimeError('NOT_FOUND', `External operation not found: ${id}`);
      if (!expectedStates.includes(current.state)) {
        throw new RuntimeError('EXECUTION_CONFLICT', `External operation ${id} cannot transition from ${current.state} to ${state}`);
      }
      const updatedAt = new Date().toISOString();
      const nextMetadata = metadata ? { ...current.metadata, ...metadata } : current.metadata;
      this.db.prepare('UPDATE external_operations SET state = ?, metadata_json = ?, updated_at = ? WHERE id = ?')
        .run(state, JSON.stringify(nextMetadata), updatedAt, id);
      this.db.exec('COMMIT;');
      return { ...current, state, metadata: nextMetadata, updatedAt };
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  private externalOperationFromRow(row: ExternalOperationRow): OperationJournalEntry {
    return {
      id: row.id, kind: row.kind, subjectId: row.subject_id, retrySafe: row.retry_safe === 1,
      state: row.state, metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
      createdAt: row.created_at, updatedAt: row.updated_at
    };
  }

  appendEvent(eventType: string, subjectType: string, subjectId: string, scopeId: string | null, payload: unknown): void {
    this.db.prepare(`INSERT INTO runtime_events
      (event_type, subject_type, subject_id, scope_id, payload_json, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?)`
    ).run(eventType, subjectType, subjectId, scopeId, JSON.stringify(payload), new Date().toISOString());
  }
}
