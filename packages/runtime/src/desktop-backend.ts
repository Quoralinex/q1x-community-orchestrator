import { randomUUID } from 'node:crypto';
import type {
  DesktopActionBatch,
  DesktopBatchResult,
  DesktopEndpoint,
  DesktopPlatform
} from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

export interface DesktopBackendProbe {
  available: boolean;
  platform: DesktopPlatform;
  operations: string[];
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface DesktopBackendSession {
  readonly endpointId: string;
  close(): Promise<void>;
}

export interface DesktopBackend {
  readonly id: string;
  probe(): Promise<DesktopBackendProbe>;
  open(endpoint: DesktopEndpoint): Promise<DesktopBackendSession>;
  execute(session: DesktopBackendSession, batch: DesktopActionBatch, signal?: AbortSignal): Promise<DesktopBatchResult>;
}
export interface DesktopSessionHandle {
  id: string;
  endpointId: string;
  backend: string;
  createdAt: string;
}

interface DesktopSessionRecord {
  handle: DesktopSessionHandle;
  endpoint: DesktopEndpoint;
  backend: DesktopBackend;
  session: DesktopBackendSession;
}

export class DesktopBackendRegistry {
  private readonly backends = new Map<string, DesktopBackend>();

  constructor(backends: DesktopBackend[] = []) {
    for (const backend of backends) this.register(backend);
  }

  register(backend: DesktopBackend): void {
    if (!backend.id) throw new RuntimeError('TRANSPORT_NOT_FOUND', 'Desktop backend id is required');
    if (this.backends.has(backend.id)) {
      throw new RuntimeError('CONFLICT', `Desktop backend already registered: ${backend.id}`);
    }
    this.backends.set(backend.id, backend);
  }

  get(id: string): DesktopBackend | undefined { return this.backends.get(id); }
  ids(): string[] { return [...this.backends.keys()].sort((a, b) => a.localeCompare(b)); }
  async probe(id: string): Promise<DesktopBackendProbe> {
    const backend = this.backends.get(id);
    if (!backend) throw new RuntimeError('TRANSPORT_NOT_FOUND', `No desktop backend registered: ${id}`);
    return backend.probe();
  }
}

export class DesktopSessionManager {
  private readonly sessions = new Map<string, DesktopSessionRecord>();

  constructor(private readonly registry: DesktopBackendRegistry) {}

  async openSession(endpoint: DesktopEndpoint): Promise<DesktopSessionHandle> {
    const backend = this.registry.get(endpoint.backend);
    if (!backend) throw new RuntimeError('TRANSPORT_NOT_FOUND', `No desktop backend registered: ${endpoint.backend}`);
    const session = await backend.open(endpoint);
    const handle: DesktopSessionHandle = {
      id: `desktop.session.${randomUUID()}`,
      endpointId: endpoint.id,
      backend: backend.id,
      createdAt: new Date().toISOString()
    };
    this.sessions.set(handle.id, { handle, endpoint, backend, session });
    return handle;
  }

  getSession(id: string): DesktopSessionHandle | undefined { return this.sessions.get(id)?.handle; }
  count(): number { return this.sessions.size; }
  hasBackend(id: string): boolean { return this.registry.get(id) !== undefined; }
  registerBackend(backend: DesktopBackend): void { this.registry.register(backend); }
  async execute(id: string, batch: DesktopActionBatch, signal?: AbortSignal): Promise<DesktopBatchResult> {
    const record = this.requireRecord(id);
    return record.backend.execute(record.session, batch, signal);
  }

  async closeSession(id: string): Promise<void> {
    const record = this.sessions.get(id);
    if (!record) throw new RuntimeError('NOT_FOUND', `Desktop session not found: ${id}`);
    this.sessions.delete(id);
    await record.session.close();
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.sessions.keys()]) await this.closeSession(id);
  }

  requireRecord(id: string): DesktopSessionRecord {
    const record = this.sessions.get(id);
    if (!record) throw new RuntimeError('NOT_FOUND', `Desktop session not found: ${id}`);
    return record;
  }
}
