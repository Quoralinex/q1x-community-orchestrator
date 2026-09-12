import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RuntimeError } from './errors.js';
import { resolveRuntimeHome } from './home.js';
import { CURRENT_STATE_SCHEMA_VERSION, classifyStateSchema } from './state-schema.js';

export interface BackupFileRecord {
  path: string;
  size: number;
  sha256: string;
}

export interface BackupManifest {
  schema: 'q1x.runtime-backup.v1';
  runtimeVersion: string;
  stateSchemaVersion: number;
  createdAt: string;
  sqliteIntegrity: 'ok';
  sourceIdentity?: { release?: string; sourceSha?: string };
  files: BackupFileRecord[];
}
export interface BackupCreationResult extends BackupManifest {
  directory: string;
}

export interface BackupVerification {
  schema: 'q1x.runtime-backup-verification.v1';
  backupPath: string;
  valid: boolean;
  stateSchemaVersion?: number;
  findings: string[];
}

interface MetadataRow { value: string; }

async function runtimeVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version?: unknown };
  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    throw new RuntimeError('STORAGE_ERROR', 'Runtime package version is unavailable');
  }
  return packageJson.version;
}

function sqliteIntegrity(db: DatabaseSync): string {
  const row = db.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined;
  return String(row ? Object.values(row)[0] ?? 'unknown' : 'unknown');
}
function stateSchemaVersion(db: DatabaseSync): number | undefined {
  try {
    const row = db.prepare("SELECT value FROM runtime_metadata WHERE key='state_schema_version'").get() as MetadataRow | undefined;
    if (!row) return undefined;
    const version = Number(row.value);
    return Number.isInteger(version) ? version : undefined;
  } catch {
    return undefined;
  }
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function fileRecord(path: string, relativePath: string): Promise<BackupFileRecord> {
  const info = await stat(path);
  return { path: relativePath, size: info.size, sha256: await sha256(path) };
}

function sqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function safeRelativeFile(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value)) return false;
  const normalized = normalize(value);
  return normalized === value && value !== '..' && !value.startsWith(`..${sep}`) && basename(value) === value;
}
export async function createRuntimeBackup(homeInput: string, outputDir: string): Promise<BackupCreationResult> {
  const home = resolveRuntimeHome(homeInput);
  const sourcePath = join(home, 'state.sqlite');
  try { await access(sourcePath); } catch {
    throw new RuntimeError('STORAGE_ERROR', 'Runtime state database does not exist');
  }
  const output = resolve(outputDir);
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(join(output, 'q1x-backup-'));
  const snapshotPath = join(directory, 'state.sqlite');
  let source: DatabaseSync | undefined;
  try {
    source = new DatabaseSync(sourcePath);
    source.exec('PRAGMA busy_timeout = 5000;');
    const integrity = sqliteIntegrity(source);
    if (integrity !== 'ok') throw new RuntimeError('STORAGE_ERROR', `SQLite integrity check failed: ${integrity}`);
    const version = stateSchemaVersion(source);
    if (version === undefined || version !== CURRENT_STATE_SCHEMA_VERSION) {
      throw new RuntimeError('INCOMPATIBLE_STATE', 'Runtime state schema is not current');
    }
    source.exec(`VACUUM INTO '${sqlLiteral(snapshotPath)}';`);
    source.close();
    source = undefined;
    const snapshot = new DatabaseSync(snapshotPath);
    const snapshotIntegrity = sqliteIntegrity(snapshot);
    snapshot.close();
    if (snapshotIntegrity !== 'ok') throw new RuntimeError('STORAGE_ERROR', `Backup SQLite integrity check failed: ${snapshotIntegrity}`);

    const manifest: BackupManifest = {
      schema: 'q1x.runtime-backup.v1',
      runtimeVersion: await runtimeVersion(),
      stateSchemaVersion: version,
      createdAt: new Date().toISOString(),
      sqliteIntegrity: 'ok',
      files: [await fileRecord(snapshotPath, 'state.sqlite')],
    };
    await writeFile(join(directory, 'backup-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    return { ...manifest, directory };
  } catch (error) {
    try { source?.close(); } catch { /* already closed */ }
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function readManifest(backupPath: string): Promise<BackupManifest> {
  return JSON.parse(await readFile(join(backupPath, 'backup-manifest.json'), 'utf8')) as BackupManifest;
}

export async function digestRuntimeBackup(pathInput: string): Promise<string> {
  const verification = await verifyRuntimeBackup(pathInput);
  if (!verification.valid) {
    throw new RuntimeError('BACKUP_INTEGRITY_FAILED', `Backup verification failed: ${verification.findings.join('; ')}`);
  }
  const manifest = await readManifest(verification.backupPath);
  const canonical = {
    schema: manifest.schema,
    stateSchemaVersion: manifest.stateSchemaVersion,
    files: [...manifest.files]
      .map(({ path, size, sha256 }) => ({ path, size, sha256 }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
export async function verifyRuntimeBackup(pathInput: string): Promise<BackupVerification> {
  const backupPath = resolve(pathInput);
  const findings: string[] = [];
  let manifest: BackupManifest | undefined;
  try { manifest = await readManifest(backupPath); } catch {
    findings.push('backup manifest is missing or invalid');
    return { schema: 'q1x.runtime-backup-verification.v1', backupPath, valid: false, findings };
  }
  if (manifest.schema !== 'q1x.runtime-backup.v1') findings.push('unsupported backup manifest schema');
  if (!Number.isInteger(manifest.stateSchemaVersion) || classifyStateSchema(manifest.stateSchemaVersion) === 'future') {
    findings.push('incompatible state schema version');
  }
  if (manifest.sqliteIntegrity !== 'ok') findings.push('backup manifest does not attest SQLite integrity');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) findings.push('backup manifest has no files');

  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const paths = new Set<string>();
  for (const item of files) {
    if (!safeRelativeFile(item?.path)) findings.push('backup manifest contains an unsafe file path');
    else if (paths.has(item.path)) findings.push(`duplicate backup file entry: ${item.path}`);
    else paths.add(item.path);
  }
  try {
    const actualEntries = (await readdir(backupPath)).sort();
    const expectedEntries = ['backup-manifest.json', ...paths].sort();
    for (const entry of actualEntries.filter(entry => !expectedEntries.includes(entry))) {
      findings.push(`unexpected backup entry: ${entry}`);
    }
    for (const entry of expectedEntries.filter(entry => !actualEntries.includes(entry))) {
      findings.push(`missing backup entry: ${entry}`);
    }
  } catch {
    findings.push('backup directory cannot be read');
  }

  for (const item of files) {
    if (!safeRelativeFile(item?.path)) continue;
    const filePath = join(backupPath, item.path);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) findings.push(`backup entry is not a file: ${item.path}`);
      if (!Number.isInteger(item.size) || item.size !== info.size) findings.push(`size mismatch: ${item.path}`);
      if (typeof item.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(item.sha256) || item.sha256 !== await sha256(filePath)) {
        findings.push(`sha256 mismatch: ${item.path}`);
      }
    } catch {
      findings.push(`missing backup file: ${item.path}`);
    }
  }
  const sqlitePath = join(backupPath, 'state.sqlite');
  if (paths.has('state.sqlite')) {
    try {
      const db = new DatabaseSync(sqlitePath);
      const integrity = sqliteIntegrity(db);
      const schemaVersion = stateSchemaVersion(db);
      db.close();
      if (integrity !== 'ok') findings.push(`SQLite integrity check failed: ${integrity}`);
      if (schemaVersion !== manifest.stateSchemaVersion) findings.push('state schema marker does not match manifest');
    } catch {
      findings.push('backup state database cannot be opened');
    }
  } else {
    findings.push('backup manifest does not include state.sqlite');
  }

  return {
    schema: 'q1x.runtime-backup-verification.v1',
    backupPath,
    valid: findings.length === 0,
    stateSchemaVersion: manifest.stateSchemaVersion,
    findings,
  };
}

async function targetState(target: string): Promise<'absent' | 'empty' | 'non-empty'> {
  try {
    const info = await stat(target);
    if (!info.isDirectory()) return 'non-empty';
    return (await readdir(target)).length === 0 ? 'empty' : 'non-empty';
  } catch { return 'absent'; }
}
export async function restoreRuntimeBackup(pathInput: string, targetHomeInput: string): Promise<BackupManifest> {
  const verification = await verifyRuntimeBackup(pathInput);
  if (!verification.valid) {
    throw new RuntimeError('BACKUP_INTEGRITY_FAILED', `Backup verification failed: ${verification.findings.join('; ')}`);
  }
  const backupPath = verification.backupPath;
  const manifest = await readManifest(backupPath);
  const target = resolveRuntimeHome(targetHomeInput);
  const state = await targetState(target);
  if (state === 'non-empty') {
    throw new RuntimeError('BACKUP_TARGET_NOT_EMPTY', 'Backup restore target must be absent or empty');
  }

  await mkdir(dirname(target), { recursive: true });
  const temporary = await mkdtemp(join(dirname(target), `.${basename(target)}.restore-`));
  try {
    for (const item of manifest.files) {
      if (!safeRelativeFile(item.path)) throw new RuntimeError('BACKUP_INTEGRITY_FAILED', 'Backup contains an unsafe file path');
      await copyFile(join(backupPath, item.path), join(temporary, item.path));
    }
    if (state === 'empty') await rm(target, { recursive: true });
    await rename(temporary, target);
    return manifest;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
