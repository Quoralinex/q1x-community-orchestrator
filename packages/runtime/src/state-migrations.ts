import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RuntimeError } from './errors.js';
import { resolveRuntimeHome } from './home.js';
import { CURRENT_STATE_SCHEMA_VERSION } from './state-schema.js';
import { verifyRuntimeBackup } from './backup.js';

export type RuntimeStateKind = 'fresh' | 'current' | 'migration-required' | 'future' | 'invalid';
export type StateMigrationSource = number | 'legacy-unversioned';

export interface StateMigrationInspection {
  schema: 'q1x.runtime-state-inspection.v1';
  state: RuntimeStateKind;
  sourceSchemaVersion: number | null;
  targetSchemaVersion: number;
  steps: string[];
}

export interface StateMigrationStep {
  id: string;
  source: StateMigrationSource;
  target: number;
  destructive: boolean;
  precondition(db: DatabaseSync): void;
  apply(db: DatabaseSync): void;
  verify(db: DatabaseSync): void;
}

export interface StateMigrationPlan {
  schema: 'q1x.runtime-state-migration-plan.v1';
  state: RuntimeStateKind;
  sourceSchemaVersion: number | null;
  targetSchemaVersion: number;
  steps: Array<{ id: string; source: StateMigrationSource; target: number; destructive: boolean }>;
}

export interface StateMigrationResult {
  schema: 'q1x.runtime-state-migration-result.v1';
  applied: boolean;
  sourceSchemaVersion: number | null;
  targetSchemaVersion: number;
  steps: string[];
}

export interface ApplyStateMigrationOptions {
  dryRun?: boolean;
  backupPath?: string;
}

interface MetadataRow { value: string; }
interface TableRow { name: string; }

function tableNames(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as unknown as TableRow[];
  return new Set(rows.map(row => row.name));
}

function marker(db: DatabaseSync): string | undefined {
  const tables = tableNames(db);
  if (!tables.has('runtime_metadata')) return undefined;
  const row = db.prepare("SELECT value FROM runtime_metadata WHERE key='state_schema_version'").get() as MetadataRow | undefined;
  return row?.value;
}

function legacyPrecondition(db: DatabaseSync): void {
  const tables = tableNames(db);
  if (tables.has('runtime_metadata') || !tables.has('document_versions') || !tables.has('document_heads')) {
    throw new Error('State does not match the supported legacy-unversioned layout');
  }
}

const DEFAULT_MIGRATIONS: readonly StateMigrationStep[] = Object.freeze([{
  id: 'legacy-unversioned-to-v1',
  source: 'legacy-unversioned',
  target: 1,
  destructive: false,
  precondition: legacyPrecondition,
  apply() { /* marker advancement is owned by the migration engine */ },
  verify(db) {
    if (marker(db) !== '1') throw new Error('State schema marker did not advance to version 1');
  },
}]);

function pathFrom(source: StateMigrationSource, registry: readonly StateMigrationStep[]): StateMigrationStep[] | undefined {
  const steps: StateMigrationStep[] = [];
  let cursor: StateMigrationSource = source;
  const seen = new Set<string>();
  while (cursor !== CURRENT_STATE_SCHEMA_VERSION) {
    const key = String(cursor);
    if (seen.has(key)) return undefined;
    seen.add(key);
    const step = registry.find(candidate => candidate.source === cursor);
    if (!step || !Number.isInteger(step.target) || step.target <= 0) return undefined;
    steps.push(step);
    cursor = step.target;
  }
  return steps;
}

function inspectWithRegistry(homeInput: string, registry: readonly StateMigrationStep[]): StateMigrationInspection {
  const home = resolveRuntimeHome(homeInput);
  const databasePath = join(home, 'state.sqlite');
  if (!existsSync(databasePath)) {
    return { schema: 'q1x.runtime-state-inspection.v1', state: 'fresh', sourceSchemaVersion: null, targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION, steps: [] };
  }
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(databasePath, { readOnly: true });
    const integrityRow = db.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined;
    const integrity = String(integrityRow ? Object.values(integrityRow)[0] ?? 'unknown' : 'unknown');
    if (integrity !== 'ok') {
      return { schema: 'q1x.runtime-state-inspection.v1', state: 'invalid', sourceSchemaVersion: null, targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION, steps: [] };
    }
    const tables = tableNames(db);
    if (tables.size === 0) {
      return { schema: 'q1x.runtime-state-inspection.v1', state: 'fresh', sourceSchemaVersion: null, targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION, steps: [] };
    }
    if (!tables.has('runtime_metadata')) {
      try { legacyPrecondition(db); } catch {
        return { schema: 'q1x.runtime-state-inspection.v1', state: 'invalid', sourceSchemaVersion: null, targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION, steps: [] };
      }
      const steps = pathFrom('legacy-unversioned', registry);
      return {
        schema: 'q1x.runtime-state-inspection.v1',
        state: steps ? 'migration-required' : 'invalid',
        sourceSchemaVersion: null,
        targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION,
        steps: steps?.map(step => step.id) ?? [],
      };
    }
    const raw = marker(db);
    if (raw === undefined) {
      return { schema: 'q1x.runtime-state-inspection.v1', state: 'invalid', sourceSchemaVersion: null, targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION, steps: [] };
    }
    const version = Number(raw);
    if (!Number.isInteger(version) || version < 0) {
      return { schema: 'q1x.runtime-state-inspection.v1', state: 'invalid', sourceSchemaVersion: null, targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION, steps: [] };
    }
    if (version === CURRENT_STATE_SCHEMA_VERSION) {
      return { schema: 'q1x.runtime-state-inspection.v1', state: 'current', sourceSchemaVersion: version, targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION, steps: [] };
    }
    if (version > CURRENT_STATE_SCHEMA_VERSION) {
      return { schema: 'q1x.runtime-state-inspection.v1', state: 'future', sourceSchemaVersion: version, targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION, steps: [] };
    }
    const steps = pathFrom(version, registry);
    return {
      schema: 'q1x.runtime-state-inspection.v1',
      state: steps ? 'migration-required' : 'invalid',
      sourceSchemaVersion: version,
      targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION,
      steps: steps?.map(step => step.id) ?? [],
    };
  } catch {
    return { schema: 'q1x.runtime-state-inspection.v1', state: 'invalid', sourceSchemaVersion: null, targetSchemaVersion: CURRENT_STATE_SCHEMA_VERSION, steps: [] };
  } finally {
    try { db?.close(); } catch { /* already closed */ }
  }
}

export function inspectRuntimeState(home: string): StateMigrationInspection {
  return inspectWithRegistry(home, DEFAULT_MIGRATIONS);
}

function planWithRegistry(home: string, registry: readonly StateMigrationStep[]): StateMigrationPlan {
  const inspection = inspectWithRegistry(home, registry);
  const source: StateMigrationSource | undefined = inspection.state === 'migration-required'
    ? (inspection.sourceSchemaVersion === null ? 'legacy-unversioned' : inspection.sourceSchemaVersion)
    : undefined;
  const steps = source === undefined ? [] : (pathFrom(source, registry) ?? []);
  return {
    schema: 'q1x.runtime-state-migration-plan.v1',
    state: inspection.state,
    sourceSchemaVersion: inspection.sourceSchemaVersion,
    targetSchemaVersion: inspection.targetSchemaVersion,
    steps: steps.map(step => ({ id: step.id, source: step.source, target: step.target, destructive: step.destructive })),
  };
}

export function planStateMigration(home: string): StateMigrationPlan {
  return planWithRegistry(home, DEFAULT_MIGRATIONS);
}

function writeMarker(db: DatabaseSync, version: number): void {
  db.exec('CREATE TABLE IF NOT EXISTS runtime_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  db.prepare(`INSERT INTO runtime_metadata (key, value) VALUES ('state_schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(version));
}

export async function applyStateMigrationsWithRegistry(
  homeInput: string,
  registry: readonly StateMigrationStep[],
  options: ApplyStateMigrationOptions = {},
): Promise<StateMigrationResult> {
  const home = resolveRuntimeHome(homeInput);
  const plan = planWithRegistry(home, registry);
  if (plan.state === 'fresh' || plan.state === 'current') {
    return { schema: 'q1x.runtime-state-migration-result.v1', applied: false, sourceSchemaVersion: plan.sourceSchemaVersion, targetSchemaVersion: plan.targetSchemaVersion, steps: [] };
  }
  if (plan.state !== 'migration-required' || plan.steps.length === 0) {
    throw new RuntimeError('INCOMPATIBLE_STATE', `Runtime state cannot be migrated from ${plan.sourceSchemaVersion ?? 'unknown'} to ${plan.targetSchemaVersion}`);
  }
  if (options.dryRun) {
    return { schema: 'q1x.runtime-state-migration-result.v1', applied: false, sourceSchemaVersion: plan.sourceSchemaVersion, targetSchemaVersion: plan.targetSchemaVersion, steps: plan.steps.map(step => step.id) };
  }
  if (plan.steps.some(step => step.destructive)) {
    if (!options.backupPath) {
      throw new RuntimeError('BACKUP_INTEGRITY_FAILED', 'Destructive migration requires a verified backup');
    }
    const verification = await verifyRuntimeBackup(options.backupPath);
    if (!verification.valid) {
      throw new RuntimeError('BACKUP_INTEGRITY_FAILED', `Destructive migration backup verification failed: ${verification.findings.join('; ')}`);
    }
  }
  const databasePath = join(home, 'state.sqlite');
  const db = new DatabaseSync(databasePath);
  let transactionStarted = false;
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('BEGIN IMMEDIATE;');
    transactionStarted = true;
    for (const planned of plan.steps) {
      const step = registry.find(candidate => candidate.id === planned.id);
      if (!step) throw new Error(`Migration step disappeared: ${planned.id}`);
      step.precondition(db);
      step.apply(db);
      writeMarker(db, step.target);
      step.verify(db);
    }
    db.exec('COMMIT;');
    transactionStarted = false;
    return {
      schema: 'q1x.runtime-state-migration-result.v1',
      applied: true,
      sourceSchemaVersion: plan.sourceSchemaVersion,
      targetSchemaVersion: plan.targetSchemaVersion,
      steps: plan.steps.map(step => step.id),
    };
  } catch {
    if (transactionStarted) {
      try { db.exec('ROLLBACK;'); } catch { /* preserve migration failure */ }
    }
    throw new RuntimeError('MIGRATION_FAILED', `Runtime state migration failed while applying ${plan.steps.map(step => step.id).join(', ')}`);
  } finally {
    try { db.close(); } catch { /* already closed */ }
  }
}

export async function applyStateMigrations(home: string, options: ApplyStateMigrationOptions = {}): Promise<StateMigrationResult> {
  return applyStateMigrationsWithRegistry(home, DEFAULT_MIGRATIONS, options);
}
