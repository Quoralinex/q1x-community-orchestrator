import { randomUUID } from 'node:crypto';
import type { BrowserActionBatch, BrowserBatchResult, BrowserEndpoint } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

export interface BrowserBackendSession {
  readonly persistent: boolean;
  close(): Promise<void>;
}

export interface BrowserBackend {
  readonly id: string;
  open(endpoint: BrowserEndpoint): Promise<BrowserBackendSession>;
  execute(session: BrowserBackendSession, batch: BrowserActionBatch, signal?: AbortSignal): Promise<BrowserBatchResult>;
}

export interface BrowserSessionHandle {
  id: string;
  endpointId: string;
  backend: string;
  persistent: boolean;
  createdAt: string;
}

interface SessionRecord {
  handle: BrowserSessionHandle;
  endpoint: BrowserEndpoint;
  backend: BrowserBackend;
  session: BrowserBackendSession;
}

export class BrowserBackendRegistry {
  private readonly backends = new Map<string, BrowserBackend>();
  constructor(backends: BrowserBackend[] = []) { for (const backend of backends) this.register(backend); }
  register(backend: BrowserBackend): void {
    if (!backend.id) throw new RuntimeError('TRANSPORT_NOT_FOUND', 'Browser backend id is required');
    if (this.backends.has(backend.id)) throw new RuntimeError('CONFLICT', `Browser backend already registered: ${backend.id}`);
    this.backends.set(backend.id, backend);
  }
  get(id: string): BrowserBackend | undefined { return this.backends.get(id); }
  ids(): string[] { return [...this.backends.keys()].sort((a, b) => a.localeCompare(b)); }
}

export class BrowserSessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  constructor(private readonly registry: BrowserBackendRegistry) {}
  async openSession(endpoint: BrowserEndpoint): Promise<BrowserSessionHandle> {
    const backend = this.registry.get(endpoint.backend);
    if (!backend) throw new RuntimeError('TRANSPORT_NOT_FOUND', `No browser backend registered: ${endpoint.backend}`);
    const session = await backend.open(endpoint);
    const handle: BrowserSessionHandle = {
      id: `browser.session.${randomUUID()}`,
      endpointId: endpoint.id,
      backend: backend.id,
      persistent: session.persistent,
      createdAt: new Date().toISOString()
    };
    this.sessions.set(handle.id, { handle, endpoint, backend, session });
    return handle;
  }
  getSession(id: string): BrowserSessionHandle | undefined { return this.sessions.get(id)?.handle; }
  count(): number { return this.sessions.size; }
  hasBackend(id: string): boolean { return this.registry.get(id) !== undefined; }
  registerBackend(backend: BrowserBackend): void { this.registry.register(backend); }
  async execute(id: string, batch: BrowserActionBatch, signal?: AbortSignal): Promise<BrowserBatchResult> {
    const record = this.requireRecord(id);
    return record.backend.execute(record.session, batch, signal);
  }
  async closeSession(id: string): Promise<void> {
    const record = this.sessions.get(id);
    if (!record) throw new RuntimeError('NOT_FOUND', `Browser session not found: ${id}`);
    this.sessions.delete(id);
    await record.session.close();
  }
  async closeAll(): Promise<void> {
    const ids = [...this.sessions.keys()];
    for (const id of ids) await this.closeSession(id);
  }
  requireRecord(id: string): SessionRecord {
    const record = this.sessions.get(id);
    if (!record) throw new RuntimeError('NOT_FOUND', `Browser session not found: ${id}`);
    return record;
  }
}
