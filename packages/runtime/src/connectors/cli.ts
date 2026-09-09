import { RuntimeError } from '../errors.js';
import { getBuiltInConnector, loadBuiltInConnectorCatalogue } from './catalogue.js';
import {
  configureConnector,
  getConfiguredConnector,
  setConnectorEnabled,
} from './configuration.js';

function requiredConnector(id: string | undefined) {
  if (!id) throw new Error('Connector id is required');
  const connector = getBuiltInConnector(id);
  if (!connector) throw new RuntimeError('NOT_FOUND', `Unknown connector: ${id}`);
  return connector;
}

function takePairs(args: string[], flag: string): Record<string, string> {
  const result: Record<string, string> = {};
  while (true) {
    const index = args.indexOf(flag);
    if (index < 0) break;
    const raw = args[index + 1];
    if (!raw || raw.startsWith('--')) throw new Error(`${flag} requires key=value`);
    args.splice(index, 2);
    const separator = raw.indexOf('=');
    if (separator <= 0) throw new Error(`${flag} requires key=value`);
    const key = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1);
    if (!key) throw new Error(`${flag} requires key=value`);
    result[key] = value;
  }
  return result;
}

function scalar(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function assertNoUnexpectedArgs(args: string[]): void {
  if (args.length > 0) throw new Error(`Unexpected connector arguments: ${args.join(' ')}`);
}

export function executeConnectorCli(home: string | undefined, action: string | undefined, args: string[]): unknown {
  if (action === 'list') {
    assertNoUnexpectedArgs(args);
    return loadBuiltInConnectorCatalogue();
  }

  const id = args.shift();
  const definition = requiredConnector(id);

  if (action === 'show') {
    assertNoUnexpectedArgs(args);
    return definition;
  }

  if (action === 'add') {
    assertNoUnexpectedArgs(args);
    const current = getConfiguredConnector(home, definition.id);
    if (current) return current;
    return configureConnector(home, {
      id: definition.id,
      profile: definition.profile.kind,
      parameters: {},
      environmentKeys: {},
      enabled: false,
    });
  }

  if (action === 'configure') {
    const parameterPairs = takePairs(args, '--parameter');
    const environmentKeys = takePairs(args, '--environment');
    assertNoUnexpectedArgs(args);
    const current = getConfiguredConnector(home, definition.id);
    if (!current) throw new RuntimeError('NOT_FOUND', `Configured connector not found: ${definition.id}; run connectors add first`);
    return configureConnector(home, {
      id: definition.id,
      profile: definition.profile.kind,
      enabled: current.enabled,
      parameters: {
        ...current.parameters,
        ...Object.fromEntries(Object.entries(parameterPairs).map(([key, value]) => [key, scalar(value)])),
      },
      environmentKeys: { ...current.environmentKeys, ...environmentKeys },
    });
  }

  if (action === 'enable') {
    assertNoUnexpectedArgs(args);
    return setConnectorEnabled(home, definition.id, true);
  }
  if (action === 'disable') {
    assertNoUnexpectedArgs(args);
    return setConnectorEnabled(home, definition.id, false);
  }

  throw new Error(`Unknown connectors command: ${action ?? ''}`.trim());
}
