import { createA2AAdapterTransport } from './a2a-adapter.js';
import { AdapterTransportRegistry } from './adapter-transport.js';
import { createCliAdapterTransports } from './cli-adapter.js';
import { createMcpAdapterTransports } from './mcp-adapter.js';

export function createDefaultAdapterTransportRegistry(): AdapterTransportRegistry {
  return new AdapterTransportRegistry([
    ...createCliAdapterTransports(),
    createA2AAdapterTransport(),
    ...createMcpAdapterTransports()
  ]);
}
