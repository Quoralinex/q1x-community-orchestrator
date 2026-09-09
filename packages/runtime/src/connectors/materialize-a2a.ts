import type { AdapterEndpoint, AdapterHttpTransport } from '@quoralinex/q1x-community-sdk';
import { assertSafeAdapterEndpoint } from '../adapter-security.js';
import { RuntimeError } from '../errors.js';
import type { ConfiguredConnector } from './configuration.js';
import type { ConnectorDefinition } from './types.js';

interface A2AProfileDocument {
  version: '1.0.0';
  kind: 'a2a-jsonrpc';
  protocol: 'a2a-jsonrpc';
  transport: 'http';
  defaultTimeoutMs: number;
  credential: { environmentName: string; header: string; prefix?: string };
}

const profile: A2AProfileDocument = Object.freeze({
  version: '1.0.0',
  kind: 'a2a-jsonrpc',
  protocol: 'a2a-jsonrpc',
  transport: 'http',
  defaultTimeoutMs: 30_000,
  credential: Object.freeze({ environmentName: 'apiKey', header: 'Authorization', prefix: 'Bearer ' }),
});

function requiredString(parameters: Record<string, unknown>, key: string): string {
  const value = parameters[key];
  if (typeof value !== 'string' || !value.trim()) throw new RuntimeError('INVALID_REFERENCE', `A2A connector parameter ${key} is required`);
  return value.trim();
}

function optionalUrl(parameters: Record<string, unknown>, key: string): string | undefined {
  const value = parameters[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new RuntimeError('INVALID_REFERENCE', `A2A connector parameter ${key} must be a non-empty URL`);
  return value.trim();
}

function timeout(parameters: Record<string, unknown>): number {
  const value = parameters.timeoutMs;
  if (value === undefined) return profile.defaultTimeoutMs;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 600_000) {
    throw new RuntimeError('INVALID_REFERENCE', 'A2A connector timeoutMs must be an integer between 1 and 600000');
  }
  return value;
}

function assertSafeUrl(url: string, purpose: string): void {
  const probe: AdapterEndpoint = {
    contractVersion: '1.0.0', id: `adapter.a2a.${purpose}`, name: `A2A ${purpose}`,
    adapterKind: 'a2a', protocol: 'a2a-jsonrpc', transport: { kind: 'http', url },
  };
  try {
    assertSafeAdapterEndpoint(probe);
  } catch (error) {
    if (error instanceof RuntimeError) throw new RuntimeError(error.code, `${purpose} URL is unsafe: ${error.message}`);
    throw error;
  }
}

export function loadA2AConnectorProfile(kind: string): A2AProfileDocument {
  if (kind !== profile.kind) throw new RuntimeError('NOT_FOUND', `Unknown A2A connector profile: ${kind}`);
  return structuredClone(profile);
}

export function materializeA2AConnector(definition: ConnectorDefinition, configuration: ConfiguredConnector): AdapterEndpoint {
  if (definition.category !== 'a2a') throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} is not an A2A connector`);
  if (configuration.id !== definition.id) throw new RuntimeError('INVALID_REFERENCE', 'Connector definition/configuration id mismatch');
  if (configuration.profile !== definition.profile.kind || definition.profile.kind !== profile.kind) {
    throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} requires profile ${definition.profile.kind}`);
  }
  if (definition.protocol !== profile.protocol) throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} protocol does not match A2A profile`);

  const url = requiredString(configuration.parameters, 'url');
  assertSafeUrl(url, 'endpoint');
  const base = new URL(url);
  const agentCardUrl = optionalUrl(configuration.parameters, 'agentCardUrl') ?? `${base.origin}/.well-known/agent-card.json`;
  assertSafeUrl(agentCardUrl, 'Agent Card');

  const environmentKey = configuration.environmentKeys[profile.credential.environmentName];
  const transport: AdapterHttpTransport = {
    kind: 'http', url, timeoutMs: timeout(configuration.parameters),
    ...(environmentKey ? { credentials: [{
      header: profile.credential.header,
      environmentKey,
      ...(profile.credential.prefix ? { prefix: profile.credential.prefix } : {}),
    }] } : {}),
  };
  const endpoint: AdapterEndpoint = {
    contractVersion: '1.0.0',
    id: `adapter.${definition.id}`,
    name: `${definition.name} endpoint`,
    adapterKind: 'a2a',
    protocol: profile.protocol,
    transport,
    metadata: { connectorId: definition.id, profile: profile.kind, agentCardUrl },
  };
  assertSafeAdapterEndpoint(endpoint);
  return endpoint;
}
