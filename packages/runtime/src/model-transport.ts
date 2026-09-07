import type { ModelEndpoint, ModelRequest, ModelResponse } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

export interface ModelTransportContext {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
}

export interface ModelTransport {
  readonly protocol: string;
  invoke(endpoint: ModelEndpoint, request: ModelRequest, context?: ModelTransportContext): Promise<ModelResponse>;
}

export class ModelTransportRegistry {
  private readonly transports = new Map<string, ModelTransport>();

  constructor(transports: ModelTransport[] = []) {
    for (const transport of transports) this.register(transport);
  }

  register(transport: ModelTransport): void {
    if (!transport.protocol) throw new RuntimeError('TRANSPORT_NOT_FOUND', 'Model transport protocol id is required');
    if (this.transports.has(transport.protocol)) {
      throw new RuntimeError('CONFLICT', `Model transport already registered: ${transport.protocol}`);
    }
    this.transports.set(transport.protocol, transport);
  }

  get(protocol: string): ModelTransport | undefined {
    return this.transports.get(protocol);
  }

  protocols(): string[] {
    return [...this.transports.keys()].sort((a, b) => a.localeCompare(b));
  }

  async invoke(endpoint: ModelEndpoint, request: ModelRequest, context: ModelTransportContext = {}): Promise<ModelResponse> {
    const transport = this.get(endpoint.protocol);
    if (!transport) throw new RuntimeError('TRANSPORT_NOT_FOUND', `No model transport registered for protocol: ${endpoint.protocol}`);
    return transport.invoke(endpoint, request, context);
  }
}
