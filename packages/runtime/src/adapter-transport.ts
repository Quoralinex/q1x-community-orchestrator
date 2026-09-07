import type { AdapterEndpoint, CapabilityDescriptor, ExecutionRequest, ExecutionResult } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

export interface AdapterTransportContext {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export interface AdapterTransport {
  readonly protocol: string;
  execute(endpoint: AdapterEndpoint, request: ExecutionRequest, context?: AdapterTransportContext): Promise<ExecutionResult>;
  discover?(endpoint: AdapterEndpoint, context?: AdapterTransportContext): Promise<readonly CapabilityDescriptor[]>;
}

export class AdapterTransportRegistry {
  private readonly transports = new Map<string, AdapterTransport>();

  constructor(transports: AdapterTransport[] = []) {
    for (const transport of transports) this.register(transport);
  }

  register(transport: AdapterTransport): void {
    if (!transport.protocol) throw new RuntimeError('TRANSPORT_NOT_FOUND', 'Adapter transport protocol id is required');
    if (this.transports.has(transport.protocol)) throw new RuntimeError('CONFLICT', `Adapter transport already registered: ${transport.protocol}`);
    this.transports.set(transport.protocol, transport);
  }
  get(protocol: string): AdapterTransport | undefined {
    return this.transports.get(protocol);
  }

  protocols(): string[] {
    return [...this.transports.keys()].sort((a, b) => a.localeCompare(b));
  }

  async execute(endpoint: AdapterEndpoint, request: ExecutionRequest, context: AdapterTransportContext = {}): Promise<ExecutionResult> {
    const transport = this.get(endpoint.protocol);
    if (!transport) throw new RuntimeError('TRANSPORT_NOT_FOUND', `No adapter transport registered for protocol: ${endpoint.protocol}`);
    return transport.execute(endpoint, request, context);
  }

  async discover(endpoint: AdapterEndpoint, context: AdapterTransportContext = {}): Promise<readonly CapabilityDescriptor[]> {
    const transport = this.get(endpoint.protocol);
    if (!transport) throw new RuntimeError('TRANSPORT_NOT_FOUND', `No adapter transport registered for protocol: ${endpoint.protocol}`);
    if (!transport.discover) return [];
    return transport.discover(endpoint, context);
  }
}
