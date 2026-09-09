import type { AdapterEndpoint, AdapterStdioTransport } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from '../errors.js';
import type { ConfiguredConnector } from './configuration.js';
import type { ConnectorDefinition } from './types.js';

interface CliProfileDocument {
  version: '1.0.0';
  kind: 'cli-json-stdio' | 'cli-text-stdio';
  protocol: 'cli-json-stdio' | 'cli-text-stdio';
  transport: 'stdio';
  inputMode: 'json' | 'text';
  outputMode: 'json' | 'text';
  defaultTimeoutMs: number;
  defaultMaxOutputBytes: number;
}

const profiles: Record<CliProfileDocument['kind'], CliProfileDocument> = {
  'cli-json-stdio': Object.freeze({
    version: '1.0.0', kind: 'cli-json-stdio', protocol: 'cli-json-stdio', transport: 'stdio',
    inputMode: 'json', outputMode: 'json', defaultTimeoutMs: 30_000, defaultMaxOutputBytes: 1_048_576,
  }),
  'cli-text-stdio': Object.freeze({
    version: '1.0.0', kind: 'cli-text-stdio', protocol: 'cli-text-stdio', transport: 'stdio',
    inputMode: 'text', outputMode: 'text', defaultTimeoutMs: 30_000, defaultMaxOutputBytes: 1_048_576,
  }),
};

function requiredString(parameters: Record<string, unknown>, key: string): string {
  const value = parameters[key];
  if (typeof value !== 'string' || !value.trim()) throw new RuntimeError('INVALID_REFERENCE', `CLI connector parameter ${key} is required`);
  return value.trim();
}

function optionalString(parameters: Record<string, unknown>, key: string): string | undefined {
  const value = parameters[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new RuntimeError('INVALID_REFERENCE', `CLI connector parameter ${key} must be a non-empty string`);
  return value.trim();
}

function args(parameters: Record<string, unknown>): string[] | undefined {
  const value = parameters.args;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new RuntimeError('INVALID_REFERENCE', 'CLI connector args must be an array of strings');
  }
  return [...value];
}

function boundedInteger(parameters: Record<string, unknown>, key: string, fallback: number, maximum: number): number {
  const value = parameters[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RuntimeError('INVALID_REFERENCE', `CLI connector ${key} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

export function loadCliConnectorProfile(kind: string): CliProfileDocument {
  const profile = profiles[kind as CliProfileDocument['kind']];
  if (!profile) throw new RuntimeError('NOT_FOUND', `Unknown CLI connector profile: ${kind}`);
  return structuredClone(profile);
}

export function materializeCliConnector(definition: ConnectorDefinition, configuration: ConfiguredConnector): AdapterEndpoint {
  if (definition.category !== 'cli') throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} is not a CLI connector`);
  if (configuration.id !== definition.id) throw new RuntimeError('INVALID_REFERENCE', 'Connector definition/configuration id mismatch');
  if (configuration.profile !== definition.profile.kind) throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} requires profile ${definition.profile.kind}`);
  const profile = loadCliConnectorProfile(definition.profile.kind);
  if (definition.protocol !== profile.protocol) throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} protocol does not match CLI profile`);

  const command = requiredString(configuration.parameters, 'command');
  const argv = args(configuration.parameters);
  const cwd = optionalString(configuration.parameters, 'cwd');
  const timeoutMs = boundedInteger(configuration.parameters, 'timeoutMs', profile.defaultTimeoutMs, 600_000);
  const maxOutputBytes = boundedInteger(configuration.parameters, 'maxOutputBytes', profile.defaultMaxOutputBytes, 16_777_216);
  const environment = Object.entries(configuration.environmentKeys)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, environmentKey]) => ({ name, environmentKey }));

  const transport: AdapterStdioTransport = {
    kind: 'stdio',
    command,
    ...(argv ? { args: argv } : {}),
    ...(cwd ? { cwd } : {}),
    timeoutMs,
    maxOutputBytes,
    inputMode: profile.inputMode,
    outputMode: profile.outputMode,
    ...(environment.length > 0 ? { environment } : {}),
  };

  return {
    contractVersion: '1.0.0',
    id: `adapter.${definition.id}`,
    name: `${definition.name} endpoint`,
    adapterKind: 'cli-tui',
    protocol: profile.protocol,
    transport,
    metadata: { connectorId: definition.id, profile: profile.kind },
  };
}
