import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CONTRACT_VERSION, SCHEMA_IDS } from '@quoralinex/q1x-community-contracts';
import type { AuditReceipt, AuditVerification, Reference } from '@quoralinex/q1x-community-sdk';
import { resolveRuntimeHome } from './home.js';
import { validateContract } from './schema-loader.js';

const SENSITIVE_KEY = /(authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|session)/i;

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}

export function redactAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditMetadata);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactAuditMetadata(item);
  }
  return output;
}

function digestFor(input: Omit<AuditReceipt, 'id' | 'digest' | 'contractVersion'>): string {
  return `sha256:${createHash('sha256').update(stable(input)).digest('hex')}`;
}

interface Row {
  sequence: number;
  id: string;
  event_type: string;
  subject_json: string;
  scope_id: string | null;
  metadata_json: string | null;
  previous_digest: string | null;
  digest: string;
  occurred_at: string;
}

export class SecurityAuditStore {
  private readonly db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
  }

  static open(home?: string): SecurityAuditStore {
    const databasePath = join(resolveRuntimeHome(home), 'state.sqlite');
    const db = new DatabaseSync(databasePath);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS security_audit_receipts (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        subject_json TEXT NOT NULL,
        scope_id TEXT,
        metadata_json TEXT,
        previous_digest TEXT,
        digest TEXT NOT NULL UNIQUE,
        occurred_at TEXT NOT NULL
      );
    `);
    return new SecurityAuditStore(db);
  }

  close(): void {
    this.db.close();
  }

  append(eventType: string, subject: Reference, scopeId?: string, metadata?: Record<string, unknown>): AuditReceipt {
    const previous = this.db.prepare('SELECT sequence, digest FROM security_audit_receipts ORDER BY sequence DESC LIMIT 1').get() as { sequence: number; digest: string } | undefined;
    const sequence = (previous?.sequence ?? 0) + 1;
    const occurredAt = new Date().toISOString();
    const safeMetadata = metadata ? redactAuditMetadata(metadata) as Record<string, unknown> : undefined;
    const body = {
      sequence,
      eventType,
      subject,
      ...(scopeId ? { scopeId } : {}),
      ...(safeMetadata ? { metadata: safeMetadata } : {}),
      ...(previous ? { previousDigest: previous.digest } : {}),
      occurredAt
    };
    const digest = digestFor(body);
    const id = `audit.${sequence}.${digest.slice(7, 19)}`;
    const receipt: AuditReceipt = { contractVersion: CONTRACT_VERSION, id, ...body, digest };
    validateContract(SCHEMA_IDS.auditReceipt, receipt);
    this.db.prepare(`INSERT INTO security_audit_receipts
      (sequence, id, event_type, subject_json, scope_id, metadata_json, previous_digest, digest, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sequence, id, eventType, JSON.stringify(subject), scopeId ?? null, safeMetadata ? JSON.stringify(safeMetadata) : null, previous?.digest ?? null, digest, occurredAt);
    return receipt;
  }

  list(): AuditReceipt[] {
    const rows = this.db.prepare('SELECT * FROM security_audit_receipts ORDER BY sequence').all() as unknown as Row[];
    return rows.map(row => ({
      contractVersion: CONTRACT_VERSION,
      id: row.id,
      sequence: row.sequence,
      eventType: row.event_type,
      subject: JSON.parse(row.subject_json) as Reference,
      ...(row.scope_id ? { scopeId: row.scope_id } : {}),
      ...(row.metadata_json ? { metadata: JSON.parse(row.metadata_json) as Record<string, unknown> } : {}),
      ...(row.previous_digest ? { previousDigest: row.previous_digest } : {}),
      digest: row.digest,
      occurredAt: row.occurred_at
    }));
  }

  verify(): AuditVerification {
    const receipts = this.list();
    let previousDigest: string | undefined;
    for (const receipt of receipts) {
      const body = {
        sequence: receipt.sequence,
        eventType: receipt.eventType,
        subject: receipt.subject,
        ...(receipt.scopeId ? { scopeId: receipt.scopeId } : {}),
        ...(receipt.metadata ? { metadata: receipt.metadata } : {}),
        ...(previousDigest ? { previousDigest } : {}),
        occurredAt: receipt.occurredAt
      };
      const expectedDigest = digestFor(body);
      if (receipt.previousDigest !== previousDigest || receipt.digest !== expectedDigest) {
        return { valid: false, checked: receipt.sequence - 1, firstInvalidSequence: receipt.sequence, expectedDigest, actualDigest: receipt.digest };
      }
      previousDigest = receipt.digest;
    }
    return { valid: true, checked: receipts.length };
  }
}
