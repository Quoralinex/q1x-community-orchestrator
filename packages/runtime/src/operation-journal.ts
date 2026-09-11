import { randomUUID } from 'node:crypto';
import type { SqliteStore } from './store.js';
import { RuntimeError } from './errors.js';

export type ExternalOperationState =
  | 'intent-recorded'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'interrupted-uncertain';

export type ExternalOperationKind = 'model' | 'adapter' | 'browser' | 'desktop' | 'supervision';

export interface OperationJournalEntry {
  id: string;
  kind: ExternalOperationKind;
  subjectId: string;
  retrySafe: boolean;
  state: ExternalOperationState;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BeginOperationInput {
  id?: string;
  kind: ExternalOperationKind;
  subjectId: string;
  retrySafe: boolean;
  metadata?: Record<string, unknown>;
}
export interface CompleteOperationInput {
  state: 'completed' | 'failed';
  resultRef?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY = /(authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|session|prompt|input|output|content|text)/i;
const MAX_STRING = 256;
const MAX_ITEMS = 20;
const MAX_METADATA_BYTES = 4096;

function boundedValue(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map(boundedValue);
  if (!value || typeof value !== 'object') return String(value).slice(0, MAX_STRING);
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort().slice(0, MAX_ITEMS)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : boundedValue((value as Record<string, unknown>)[key]);
  }
  return output;
}
export function sanitizeOperationMetadata(value: Record<string, unknown> = {}): Record<string, unknown> {
  const bounded = boundedValue(value) as Record<string, unknown>;
  if (Buffer.byteLength(JSON.stringify(bounded), 'utf8') <= MAX_METADATA_BYTES) return bounded;
  return { truncated: true };
}

export function beginOperation(store: SqliteStore, input: BeginOperationInput): OperationJournalEntry {
  const id = input.id ?? `operation.${input.kind}.${randomUUID()}`;
  const existing = store.getExternalOperation(id);
  if (existing) {
    if (existing.state === 'intent-recorded' && existing.kind === input.kind && existing.subjectId === input.subjectId && existing.retrySafe === input.retrySafe) {
      return existing;
    }
    throw new RuntimeError('EXECUTION_CONFLICT', `External operation already exists: ${id}`);
  }
  const now = new Date().toISOString();
  const entry: OperationJournalEntry = {
    id,
    kind: input.kind,
    subjectId: input.subjectId,
    retrySafe: input.retrySafe,
    state: 'intent-recorded',
    metadata: sanitizeOperationMetadata(input.metadata),
    createdAt: now,
    updatedAt: now
  };
  store.insertExternalOperation(entry);
  return entry;
}

export function markOperationDispatched(store: SqliteStore, id: string): OperationJournalEntry {
  return store.transitionExternalOperation(id, ['intent-recorded'], 'dispatched');
}

export function completeOperation(store: SqliteStore, id: string, input: CompleteOperationInput): OperationJournalEntry {
  const metadata = sanitizeOperationMetadata({
    ...(input.metadata ?? {}),
    ...(input.resultRef ? { resultRef: input.resultRef } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {})
  });
  return store.transitionExternalOperation(id, ['dispatched'], input.state, metadata);
}
export function markOperationUncertain(store: SqliteStore, id: string): OperationJournalEntry {
  return store.transitionExternalOperation(id, ['dispatched'], 'interrupted-uncertain');
}

export function reconcileInterruptedOperations(store: SqliteStore): OperationJournalEntry[] {
  return store.listExternalOperations()
    .filter(entry => entry.state === 'dispatched')
    .map(entry => markOperationUncertain(store, entry.id));
}
