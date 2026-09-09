import { RuntimeError } from '../errors.js';
import { SqliteStore } from '../store.js';
import { getBuiltInConnector } from './catalogue.js';

export interface ConfiguredConnector {
  id: string;
  enabled: boolean;
  profile: string;
  parameters: Record<string, unknown>;
  environmentKeys: Record<string, string>;
  updatedAt: string;
}

export interface ConfigureConnectorInput {
  id: string;
  enabled?: boolean;
  profile: string;
  parameters?: Record<string, unknown>;
  environmentKeys?: Record<string, string>;
}

const DOCUMENT_KIND = 'configured-connector';
const environmentNamePattern = /^[A-Z][A-Z0-9_]*$/;
const secretKeyPattern = /(?:secret|token|password|api[_-]?key|credential)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertNoSecretLikeKeys(value: unknown, path = 'parameters'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretLikeKeys(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (secretKeyPattern.test(key)) {
      throw new RuntimeError('INSECURE_ENDPOINT', `${path}.${key} looks like secret or credential state; store only environment-variable references`);
    }
    assertNoSecretLikeKeys(child, `${path}.${key}`);
  }
}

function validateEnvironmentKeys(environmentKeys: Record<string, string>): void {
  for (const [name, environmentKey] of Object.entries(environmentKeys)) {
    if (!name.trim() || !environmentNamePattern.test(environmentKey)) {
      throw new RuntimeError('INSECURE_ENDPOINT', `Invalid environment reference for ${name || '<empty>'}; environment values are never persisted`);
    }
  }
}

function withStore<T>(home: string | undefined, operation: (store: SqliteStore) => T): T {
  const store = SqliteStore.open(home);
  try {
    return operation(store);
  } finally {
    store.close();
  }
}

function cloneConfiguredConnector(value: ConfiguredConnector): ConfiguredConnector {
  return structuredClone(value);
}

export function configureConnector(home: string | undefined, input: ConfigureConnectorInput): ConfiguredConnector {
  const definition = getBuiltInConnector(input.id);
  if (!definition) throw new RuntimeError('INVALID_REFERENCE', `Unknown connector: ${input.id}`);
  if (input.profile !== definition.profile.kind) {
    throw new RuntimeError('INVALID_REFERENCE', `Connector ${input.id} requires profile ${definition.profile.kind}`);
  }
  const parameters = structuredClone(input.parameters ?? {});
  const environmentKeys = structuredClone(input.environmentKeys ?? {});
  assertNoSecretLikeKeys(parameters);
  validateEnvironmentKeys(environmentKeys);

  const configured: ConfiguredConnector = {
    id: input.id,
    enabled: input.enabled ?? false,
    profile: input.profile,
    parameters,
    environmentKeys,
    updatedAt: new Date().toISOString(),
  };
  return withStore(home, store => {
    store.putDocument({ kind: DOCUMENT_KIND, id: configured.id, scopeId: null, document: configured });
    store.appendEvent('connector.configure', DOCUMENT_KIND, configured.id, null, { enabled: configured.enabled, profile: configured.profile });
    return cloneConfiguredConnector(configured);
  });
}

export function getConfiguredConnector(home: string | undefined, id: string): ConfiguredConnector | undefined {
  return withStore(home, store => {
    const value = store.getDocument<ConfiguredConnector>(DOCUMENT_KIND, id);
    return value ? cloneConfiguredConnector(value) : undefined;
  });
}

export function listConfiguredConnectors(home: string | undefined): ConfiguredConnector[] {
  return withStore(home, store => store.listDocuments<ConfiguredConnector>(DOCUMENT_KIND).map(cloneConfiguredConnector));
}

export function setConnectorEnabled(home: string | undefined, id: string, enabled: boolean): ConfiguredConnector {
  const current = getConfiguredConnector(home, id);
  if (!current) throw new RuntimeError('NOT_FOUND', `Configured connector not found: ${id}`);
  const updated: ConfiguredConnector = { ...current, enabled, updatedAt: new Date().toISOString() };
  return withStore(home, store => {
    store.putDocument({ kind: DOCUMENT_KIND, id, scopeId: null, document: updated });
    store.appendEvent(enabled ? 'connector.enable' : 'connector.disable', DOCUMENT_KIND, id, null, { enabled });
    return cloneConfiguredConnector(updated);
  });
}
