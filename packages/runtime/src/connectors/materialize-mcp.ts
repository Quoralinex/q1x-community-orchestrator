import type { AdapterEndpoint, AdapterHttpTransport, AdapterStdioTransport } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from '../errors.js';
import { assertSafeAdapterEndpoint } from '../adapter-security.js';
import type { ConfiguredConnector } from './configuration.js';
import type { ConnectorDefinition } from './types.js';

export type McpConnectorProfileKind = 'mcp-stdio' | 'mcp-streamable-http';

interface McpProfileDocument {
  version: '1.0.0';
  kind: McpConnectorProfileKind;
  protocol: 'mcp-stdio-v2' | 'mcp-streamable-http-v2';
  transport: 'stdio' | 'http';
  defaultTimeoutMs: number;
  defaultMaxOutputBytes?: number;
  credential?: { environmentName: string; header: string; prefix?: string };
}

const profiles: Readonly<Record<McpConnectorProfileKind, McpProfileDocument>> = Object.freeze({
  'mcp-stdio': Object.freeze({
    version: '1.0.0', kind: 'mcp-stdio', protocol: 'mcp-stdio-v2', transport: 'stdio',
    defaultTimeoutMs: 30_000, defaultMaxOutputBytes: 4 * 1024 * 1024,
  }),
  'mcp-streamable-http': Object.freeze({
    version: '1.0.0', kind: 'mcp-streamable-http', protocol: 'mcp-streamable-http-v2', transport: 'http',
    defaultTimeoutMs: 30_000,
    credential: Object.freeze({ environmentName: 'apiKey', header: 'Authorization', prefix: 'Bearer ' }),
  }),
});

function isProfileKind(value: string): value is McpConnectorProfileKind {
  return Object.hasOwn(profiles, value);
}

function requiredString(parameters: Record<string, unknown>, key: string): string {
  const value = parameters[key];
  if (typeof value !== 'string' || !value.trim()) throw new RuntimeError('INVALID_REFERENCE', `MCP connector parameter ${key} is required`);
  return value.trim();
}

function optionalString(parameters: Record<string, unknown>, key: string): string | undefined {
  const value = parameters[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new RuntimeError('INVALID_REFERENCE', `MCP connector parameter ${key} must be a non-empty string`);
  return value;
}

function integer(parameters: Record<string, unknown>, key: string, fallback: number, max: number): number {
  const value = parameters[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new RuntimeError('INVALID_REFERENCE', `MCP connector ${key} must be an integer between 1 and ${max}`);
  }
  return value;
}

function args(parameters: Record<string, unknown>): string[] | undefined {
  const value = parameters.args;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new RuntimeError('INVALID_REFERENCE', 'MCP connector args/argv must be an array of strings');
  }
  return [...value];
}

function environment(configuration: ConfiguredConnector): Array<{ name: string; environmentKey: string }> | undefined {
  const entries = Object.entries(configuration.environmentKeys)
    .filter(([name]) => name !== 'apiKey')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, environmentKey]) => ({ name, environmentKey }));
  return entries.length ? entries : undefined;
}

export function loadMcpConnectorProfile(kind: string): McpProfileDocument {
  if (!isProfileKind(kind)) throw new RuntimeError('NOT_FOUND', `Unknown MCP connector profile: ${kind}`);
  return structuredClone(profiles[kind]);
}

export function materializeMcpConnector(definition: ConnectorDefinition, configuration: ConfiguredConnector): AdapterEndpoint {
  if (definition.category !== 'mcp') throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} is not an MCP connector`);
  if (definition.id !== configuration.id) throw new RuntimeError('INVALID_REFERENCE', 'Connector definition/configuration id mismatch');
  if (configuration.profile !== definition.profile.kind) throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} requires profile ${definition.profile.kind}`);
  const profile = loadMcpConnectorProfile(definition.profile.kind);
  if (profile.protocol !== definition.protocol) throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} protocol does not match profile ${profile.kind}`);

  let transport: AdapterStdioTransport | AdapterHttpTransport;
  if (profile.transport === 'stdio') {
    transport = {
      kind: 'stdio',
      command: requiredString(configuration.parameters, 'command'),
      ...(args(configuration.parameters) ? { args: args(configuration.parameters) } : {}),
      ...(optionalString(configuration.parameters, 'cwd') ? { cwd: optionalString(configuration.parameters, 'cwd') } : {}),
      timeoutMs: integer(configuration.parameters, 'timeoutMs', profile.defaultTimeoutMs, 600_000),
      maxOutputBytes: integer(configuration.parameters, 'maxOutputBytes', profile.defaultMaxOutputBytes ?? 4 * 1024 * 1024, 64 * 1024 * 1024),
      ...(environment(configuration) ? { environment: environment(configuration) } : {}),
    };
  } else {
    const environmentKey = profile.credential ? configuration.environmentKeys[profile.credential.environmentName] : undefined;
    transport = {
      kind: 'http',
      url: requiredString(configuration.parameters, 'url'),
      timeoutMs: integer(configuration.parameters, 'timeoutMs', profile.defaultTimeoutMs, 600_000),
      ...(profile.credential && environmentKey ? {
        credentials: [{
          header: profile.credential.header,
          environmentKey,
          ...(profile.credential.prefix ? { prefix: profile.credential.prefix } : {}),
        }],
      } : {}),
    };
  }

  const endpoint: AdapterEndpoint = {
    contractVersion: '1.0.0',
    id: `adapter.${definition.id}`,
    name: `${definition.name} endpoint`,
    adapterKind: 'mcp',
    protocol: profile.protocol,
    transport,
    metadata: { connectorId: definition.id, profile: profile.kind },
  };
  assertSafeAdapterEndpoint(endpoint);
  return endpoint;
}
