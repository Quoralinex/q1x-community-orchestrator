import type { DesktopActionBatch, DesktopBatchResult, DesktopEndpoint } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

export interface DesktopBackend {
  readonly id: string;
  execute(endpoint: DesktopEndpoint, batch: DesktopActionBatch, signal?: AbortSignal): Promise<DesktopBatchResult>;
}

export class DesktopBackendRegistry {
  private readonly backends = new Map<string, DesktopBackend>();

  constructor(backends: DesktopBackend[] = []) {
    for (const backend of backends) this.register(backend);
  }

  register(backend: DesktopBackend): void {
    if (!backend.id) throw new RuntimeError('TRANSPORT_NOT_FOUND', 'Desktop backend id is required');
    if (this.backends.has(backend.id)) throw new RuntimeError('CONFLICT', `Desktop backend already registered: ${backend.id}`);
    this.backends.set(backend.id, backend);
  }

  get(id: string): DesktopBackend | undefined { return this.backends.get(id); }
  has(id: string): boolean { return this.backends.has(id); }
  ids(): string[] { return [...this.backends.keys()].sort((a, b) => a.localeCompare(b)); }

  async execute(endpoint: DesktopEndpoint, batch: DesktopActionBatch, signal?: AbortSignal): Promise<DesktopBatchResult> {
    const backend = this.get(endpoint.backend);
    if (!backend) throw new RuntimeError('TRANSPORT_NOT_FOUND', `No desktop backend registered: ${endpoint.backend}`);
    return backend.execute(endpoint, batch, signal);
  }
}
