import type { OpenControlRuntime } from '../runtime.js';
import { RuntimeError } from '../errors.js';
import { createFirstPartyDesktopEndpoint } from '../first-party-desktop.js';
import { getBuiltInConnector } from './catalogue.js';
import { getConfiguredConnector } from './configuration.js';
import { materializeA2AConnector } from './materialize-a2a.js';
import { materializeBrowserConnector, type BrowserMaterializationOptions } from './materialize-browser.js';
import { materializeCliConnector } from './materialize-cli.js';
import { materializeMcpConnector } from './materialize-mcp.js';
import { materializeModelConnector } from './materialize-model.js';
import { runConnectorPreflight, type ConnectorPreflightOptions, type DiagnosticState } from './preflight.js';
import type { ConnectorCategory } from './types.js';

export interface ApplyConfiguredConnectorOptions {
  preflight?: ConnectorPreflightOptions;
  browser?: BrowserMaterializationOptions;
}

export interface AppliedConnectorResult {
  connectorId: string;
  category: ConnectorCategory;
  endpointId: string;
  preflightState: DiagnosticState;
}

function requiredOutputDir(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new RuntimeError('INVALID_REFERENCE', 'Desktop connector outputDir must be a non-empty string');
  }
  return value.trim();
}

export async function applyConfiguredConnector(
  runtime: OpenControlRuntime,
  connectorId: string,
  options: ApplyConfiguredConnectorOptions = {},
): Promise<AppliedConnectorResult> {
  const definition = getBuiltInConnector(connectorId);
  if (!definition) throw new RuntimeError('NOT_FOUND', `Unknown connector: ${connectorId}`);
  const configuration = getConfiguredConnector(runtime.home, connectorId);
  if (!configuration) throw new RuntimeError('NOT_FOUND', `Configured connector not found: ${connectorId}; run connectors add first`);
  if (!configuration.enabled) throw new RuntimeError('INVALID_TRANSITION', `Connector ${connectorId} is disabled; enable it before apply`);

  const preflight = await runConnectorPreflight(runtime.home, connectorId, options.preflight);
  if (preflight.state === 'unsupported') {
    throw new RuntimeError('UNSUPPORTED_PLATFORM', `Connector ${connectorId} preflight is unsupported`);
  }
  if (preflight.state === 'blocked' || preflight.state === 'not-configured') {
    throw new RuntimeError('INVALID_REFERENCE', `Connector ${connectorId} preflight is ${preflight.state}`);
  }

  let endpointId: string;
  switch (definition.category) {
    case 'model': {
      const endpoint = materializeModelConnector(definition, configuration);
      runtime.putModelEndpoint(endpoint);
      endpointId = endpoint.id;
      break;
    }
    case 'mcp': {
      const endpoint = materializeMcpConnector(definition, configuration);
      runtime.putAdapterEndpoint(endpoint);
      endpointId = endpoint.id;
      break;
    }
    case 'a2a': {
      const endpoint = materializeA2AConnector(definition, configuration);
      runtime.putAdapterEndpoint(endpoint);
      endpointId = endpoint.id;
      break;
    }
    case 'cli': {
      const endpoint = materializeCliConnector(definition, configuration);
      runtime.putAdapterEndpoint(endpoint);
      endpointId = endpoint.id;
      break;
    }
    case 'browser': {
      const endpoint = materializeBrowserConnector(definition, configuration, options.browser);
      runtime.putBrowserEndpoint(endpoint);
      endpointId = endpoint.id;
      break;
    }
    case 'desktop': {
      const platform = definition.profile.platform;
      if (!platform) throw new RuntimeError('INVALID_REFERENCE', `Desktop connector ${connectorId} does not declare a platform`);
      const endpoint = createFirstPartyDesktopEndpoint({
        platform,
        id: `desktop.${definition.id}`,
        name: `${definition.name} endpoint`,
        outputDir: requiredOutputDir(configuration.parameters.outputDir),
      });
      const environment = Object.entries(configuration.environmentKeys)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, environmentKey]) => ({ name, environmentKey }));
      const persisted = environment.length > 0 && endpoint.transport
        ? { ...endpoint, transport: { ...endpoint.transport, environment } }
        : endpoint;
      runtime.putDesktopEndpoint(persisted);
      endpointId = persisted.id;
      break;
    }
  }

  return { connectorId, category: definition.category, endpointId, preflightState: preflight.state };
}
