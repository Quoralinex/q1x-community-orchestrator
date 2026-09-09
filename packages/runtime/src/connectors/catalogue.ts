import { BUILT_IN_CONNECTOR_CATALOGUE } from './builtin-catalogue.js';
import type {
  ConnectorCatalogueDocument,
  ConnectorCatalogueValidationResult,
  ConnectorCategory,
  ConnectorCompatibilityStatus,
  ConnectorDefinition,
  ConnectorPlatform,
  ConnectorProvenance,
} from './types.js';

const categories = new Set<ConnectorCategory>(['model', 'mcp', 'a2a', 'cli', 'browser', 'desktop']);
const platforms = new Set<ConnectorPlatform>(['macos', 'windows', 'linux', 'any']);
const provenances = new Set<ConnectorProvenance>(['first-party', 'community']);
const statuses = new Set<ConnectorCompatibilityStatus>(['tested', 'experimental', 'unsupported']);
const idPattern = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/;
const protocolPattern = /^[a-z][a-z0-9]*(?:[-./][a-z0-9]+)*$/;
const envPattern = /^[A-Z][A-Z0-9_]*$/;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`${path} contains unsupported property ${key}`);
  }
}

function stringArray(value: unknown, path: string, errors: string[], predicate?: (item: string) => boolean): string[] | undefined {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    errors.push(`${path} must be an array of strings`);
    return undefined;
  }
  const items = value as string[];
  if (new Set(items).size !== items.length) errors.push(`${path} must not contain duplicates`);
  if (predicate && items.some(item => !predicate(item))) errors.push(`${path} contains an unsupported value`);
  return items;
}

function validateConnector(value: unknown, index: number, errors: string[]): ConnectorDefinition | undefined {
  const path = `connectors[${index}]`;
  const item = record(value);
  if (!item) {
    errors.push(`${path} must be an object`);
    return undefined;
  }
  exactKeys(item, ['id', 'name', 'category', 'protocol', 'platforms', 'requirements', 'profile', 'compatibility', 'provenance'], path, errors);

  if (typeof item.id !== 'string' || item.id.length > 128 || !idPattern.test(item.id)) errors.push(`${path}.id is invalid`);
  if (typeof item.name !== 'string' || item.name.length < 1 || item.name.length > 160) errors.push(`${path}.name is invalid`);
  if (typeof item.category !== 'string' || !categories.has(item.category as ConnectorCategory)) errors.push(`${path}.category is invalid`);
  if (typeof item.protocol !== 'string' || item.protocol.length > 96 || !protocolPattern.test(item.protocol)) errors.push(`${path}.protocol is invalid`);
  const platformValues = stringArray(item.platforms, `${path}.platforms`, errors, candidate => platforms.has(candidate as ConnectorPlatform));
  if (platformValues?.length === 0) errors.push(`${path}.platforms must not be empty`);
  if (typeof item.provenance !== 'string' || !provenances.has(item.provenance as ConnectorProvenance)) errors.push(`${path}.provenance is invalid`);

  const requirements = record(item.requirements);
  if (!requirements) {
    errors.push(`${path}.requirements must be an object`);
  } else {
    exactKeys(requirements, ['commands', 'environmentKeys'], `${path}.requirements`, errors);
    if (requirements.commands !== undefined) stringArray(requirements.commands, `${path}.requirements.commands`, errors, candidate => candidate.length > 0 && candidate.length <= 256);
    if (requirements.environmentKeys !== undefined) stringArray(requirements.environmentKeys, `${path}.requirements.environmentKeys`, errors, candidate => envPattern.test(candidate) && candidate.length <= 128);
  }

  const profile = record(item.profile);
  if (!profile) {
    errors.push(`${path}.profile must be an object`);
  } else {
    exactKeys(profile, ['kind', 'platform', 'template'], `${path}.profile`, errors);
    if (typeof profile.kind !== 'string' || profile.kind.length > 96 || !idPattern.test(profile.kind)) errors.push(`${path}.profile.kind is invalid`);
    if (profile.platform !== undefined && (typeof profile.platform !== 'string' || !['macos', 'windows', 'linux'].includes(profile.platform))) errors.push(`${path}.profile.platform is invalid`);
    if (profile.template !== undefined && (typeof profile.template !== 'string' || profile.template.length < 1 || profile.template.length > 256)) errors.push(`${path}.profile.template is invalid`);
  }

  const compatibility = record(item.compatibility);
  if (!compatibility) {
    errors.push(`${path}.compatibility must be an object`);
  } else {
    exactKeys(compatibility, ['status', 'matrixId', 'note'], `${path}.compatibility`, errors);
    if (typeof compatibility.status !== 'string' || !statuses.has(compatibility.status as ConnectorCompatibilityStatus)) errors.push(`${path}.compatibility.status is invalid`);
    if (compatibility.matrixId !== undefined && (typeof compatibility.matrixId !== 'string' || compatibility.matrixId.length < 1 || compatibility.matrixId.length > 160)) errors.push(`${path}.compatibility.matrixId is invalid`);
    if (compatibility.note !== undefined && (typeof compatibility.note !== 'string' || compatibility.note.length < 1 || compatibility.note.length > 500)) errors.push(`${path}.compatibility.note is invalid`);
    if (compatibility.status === 'tested' && typeof compatibility.matrixId !== 'string') errors.push(`${path}.compatibility.matrixId is required for tested connectors`);
    if (compatibility.status === 'experimental' && typeof compatibility.note !== 'string') errors.push(`${path}.compatibility.note is required for experimental connectors`);
  }

  return item as unknown as ConnectorDefinition;
}

export function validateConnectorCatalogue(value: unknown): ConnectorCatalogueValidationResult {
  const errors: string[] = [];
  const root = record(value);
  if (!root) return { ok: false, errors: ['catalogue must be an object'] };
  exactKeys(root, ['version', 'connectors'], 'catalogue', errors);
  if (root.version !== '1.0.0') errors.push('catalogue.version must be 1.0.0');
  if (!Array.isArray(root.connectors)) return { ok: false, errors: [...errors, 'catalogue.connectors must be an array'] };

  const connectors = root.connectors.map((item, index) => validateConnector(item, index, errors)).filter((item): item is ConnectorDefinition => item !== undefined);
  const ids = new Set<string>();
  const tuples = new Set<string>();
  for (const connector of connectors) {
    if (ids.has(connector.id)) errors.push(`duplicate connector id: ${connector.id}`);
    ids.add(connector.id);
    const tuple = [connector.category, connector.protocol, [...connector.platforms].sort().join(','), connector.profile.kind, connector.profile.platform ?? 'any'].join('|');
    if (tuples.has(tuple)) errors.push(`duplicate connector compatibility tuple: ${tuple}`);
    tuples.add(tuple);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { version: '1.0.0', connectors } };
}

function cloneConnector(connector: ConnectorDefinition): ConnectorDefinition {
  return structuredClone(connector);
}

export function loadBuiltInConnectorCatalogue(): readonly ConnectorDefinition[] {
  const validated = validateConnectorCatalogue(BUILT_IN_CONNECTOR_CATALOGUE);
  if (!validated.ok) throw new Error(`Built-in connector catalogue is invalid: ${validated.errors.join('; ')}`);
  return Object.freeze(validated.value.connectors.map(cloneConnector).sort((a, b) => a.id.localeCompare(b.id)));
}

export function getBuiltInConnector(id: string): ConnectorDefinition | undefined {
  const connector = loadBuiltInConnectorCatalogue().find(item => item.id === id);
  return connector ? cloneConnector(connector) : undefined;
}

export type { ConnectorCatalogueDocument, ConnectorDefinition } from './types.js';
