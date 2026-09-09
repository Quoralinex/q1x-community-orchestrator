import type { ModelEndpoint } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from '../errors.js';
import { assertSafeEndpointConfiguration, assertSafeEndpointUrl } from '../model-security.js';
import type { ConfiguredConnector } from './configuration.js';
import type { ConnectorDefinition } from './types.js';

export type ModelConnectorProfileKind =
  | 'model-openai-chat-local'
  | 'model-openai-responses-local'
  | 'model-anthropic-messages-local'
  | 'model-openai-compatible-hosted'
  | 'model-anthropic-compatible-hosted';

export interface ModelConnectorProfileDocument {
  version: '1.0.0';
  kind: ModelConnectorProfileKind;
  protocol: 'openai-chat-completions' | 'openai-responses' | 'anthropic-messages';
  adapterKind: 'local-inference' | 'provider-http';
  scope: 'local' | 'hosted';
  defaultTimeoutMs: number;
  credential?: {
    environmentName: string;
    header: string;
    prefix?: string;
  };
}

const profiles: Readonly<Record<ModelConnectorProfileKind, ModelConnectorProfileDocument>> = Object.freeze({
  'model-openai-chat-local': Object.freeze({
    version: '1.0.0', kind: 'model-openai-chat-local', protocol: 'openai-chat-completions',
    adapterKind: 'local-inference', scope: 'local', defaultTimeoutMs: 30_000,
  }),
  'model-openai-responses-local': Object.freeze({
    version: '1.0.0', kind: 'model-openai-responses-local', protocol: 'openai-responses',
    adapterKind: 'local-inference', scope: 'local', defaultTimeoutMs: 30_000,
  }),
  'model-anthropic-messages-local': Object.freeze({
    version: '1.0.0', kind: 'model-anthropic-messages-local', protocol: 'anthropic-messages',
    adapterKind: 'local-inference', scope: 'local', defaultTimeoutMs: 30_000,
  }),
  'model-openai-compatible-hosted': Object.freeze({
    version: '1.0.0', kind: 'model-openai-compatible-hosted', protocol: 'openai-responses',
    adapterKind: 'provider-http', scope: 'hosted', defaultTimeoutMs: 30_000,
    credential: Object.freeze({ environmentName: 'apiKey', header: 'Authorization', prefix: 'Bearer ' }),
  }),
  'model-anthropic-compatible-hosted': Object.freeze({
    version: '1.0.0', kind: 'model-anthropic-compatible-hosted', protocol: 'anthropic-messages',
    adapterKind: 'provider-http', scope: 'hosted', defaultTimeoutMs: 30_000,
    credential: Object.freeze({ environmentName: 'apiKey', header: 'x-api-key' }),
  }),
});

function isProfileKind(value: string): value is ModelConnectorProfileKind {
  return Object.hasOwn(profiles, value);
}

function requiredString(parameters: Record<string, unknown>, key: string): string {
  const value = parameters[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new RuntimeError('INVALID_REFERENCE', `Model connector parameter ${key} is required`);
  }
  return value.trim();
}

function timeout(parameters: Record<string, unknown>, fallback: number): number {
  const value = parameters.timeoutMs;
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 600_000) {
    throw new RuntimeError('INVALID_REFERENCE', 'Model connector timeoutMs must be an integer between 1 and 600000');
  }
  return value;
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return true;
  const parts = host.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export function loadModelConnectorProfile(kind: string): ModelConnectorProfileDocument {
  if (!isProfileKind(kind)) throw new RuntimeError('NOT_FOUND', `Unknown model connector profile: ${kind}`);
  return structuredClone(profiles[kind]);
}

export function materializeModelConnector(
  definition: ConnectorDefinition,
  configuration: ConfiguredConnector,
): ModelEndpoint {
  if (definition.category !== 'model') throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} is not a model connector`);
  if (configuration.id !== definition.id) throw new RuntimeError('INVALID_REFERENCE', 'Connector definition/configuration id mismatch');
  if (configuration.profile !== definition.profile.kind) throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} requires profile ${definition.profile.kind}`);

  const profile = loadModelConnectorProfile(definition.profile.kind);
  if (profile.protocol !== definition.protocol) {
    throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} protocol does not match profile ${profile.kind}`);
  }

  const url = requiredString(configuration.parameters, 'url');
  const model = requiredString(configuration.parameters, 'model');
  const parsed = assertSafeEndpointUrl(url);
  if (profile.scope === 'local' && !isLoopbackHostname(parsed.hostname)) {
    throw new RuntimeError('INSECURE_ENDPOINT', `Local model profile ${profile.kind} requires a loopback endpoint URL`);
  }

  const credentials = profile.credential && configuration.environmentKeys[profile.credential.environmentName]
    ? [{
        header: profile.credential.header,
        environmentKey: configuration.environmentKeys[profile.credential.environmentName],
        ...(profile.credential.prefix ? { prefix: profile.credential.prefix } : {}),
      }]
    : undefined;

  const endpoint: ModelEndpoint = {
    contractVersion: '1.0.0',
    id: `endpoint.${definition.id}`,
    name: `${definition.name} endpoint`,
    adapterKind: profile.adapterKind,
    protocol: profile.protocol,
    url,
    defaultModel: model,
    timeoutMs: timeout(configuration.parameters, profile.defaultTimeoutMs),
    ...(credentials ? { credentials } : {}),
    metadata: { connectorId: definition.id, profile: profile.kind },
  };
  assertSafeEndpointConfiguration(endpoint);
  return endpoint;
}
