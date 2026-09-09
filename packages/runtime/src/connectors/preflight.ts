import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { createMacosDoctor } from '@quoralinex/q1x-community-desktop-bridge-macos/macos';
import { createWindowsDoctor } from '@quoralinex/q1x-community-desktop-bridge-windows/windows';
import { createLinuxDoctor } from '@quoralinex/q1x-community-desktop-bridge-linux/linux';
import { RuntimeError } from '../errors.js';
import { desktopPlatformForHost } from '../desktop-security.js';
import { getBuiltInConnector } from './catalogue.js';
import { getConfiguredConnector } from './configuration.js';
import { materializeModelConnector } from './materialize-model.js';

export type DiagnosticState = 'ok' | 'warning' | 'blocked' | 'unsupported' | 'not-configured';

export interface DiagnosticCheck {
  id: string;
  state: DiagnosticState;
  message: string;
  remediation?: string;
  evidence?: Record<string, unknown>;
}

export interface ConnectorPreflightReport {
  connectorId: string;
  state: DiagnosticState;
  checks: DiagnosticCheck[];
}

interface NativeDoctorCheck {
  id: string;
  state: DiagnosticState;
  message: string;
  remediation?: string;
}

interface NativeDoctorReport {
  platform: 'macos' | 'windows' | 'linux';
  state: DiagnosticState;
  checks: NativeDoctorCheck[];
}

export interface ConnectorPreflightOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  commandExists?: (command: string) => Promise<boolean>;
  desktopDoctor?: (platform: 'macos' | 'windows' | 'linux') => Promise<NativeDoctorReport>;
  fetch?: typeof globalThis.fetch;
}

const stateOrder: DiagnosticState[] = ['blocked', 'unsupported', 'warning', 'not-configured', 'ok'];

export function aggregateDiagnosticState(checks: readonly DiagnosticCheck[]): DiagnosticState {
  return stateOrder.find(state => checks.some(check => check.state === state)) ?? 'ok';
}

export async function commandExistsOnPath(command: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const candidates = isAbsolute(command)
    ? [command]
    : (env.PATH ?? '').split(delimiter).filter(Boolean).flatMap(directory => {
        if (process.platform !== 'win32') return [join(directory, command)];
        const extensions = command.includes('.') ? [''] : (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';');
        return extensions.map(extension => join(directory, `${command}${extension.toLowerCase()}`));
      });
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return true;
    } catch {
      // Try the next PATH candidate.
    }
  }
  return false;
}

async function runDesktopDoctor(platform: 'macos' | 'windows' | 'linux'): Promise<NativeDoctorReport> {
  if (platform === 'macos') return createMacosDoctor();
  if (platform === 'windows') return createWindowsDoctor();
  return createLinuxDoctor();
}

function expectedHostPlatform(platform: NodeJS.Platform): 'macos' | 'windows' | 'linux' | undefined {
  return desktopPlatformForHost(platform);
}

async function modelReachabilityCheck(
  definition: NonNullable<ReturnType<typeof getBuiltInConnector>>,
  configured: NonNullable<ReturnType<typeof getConfiguredConnector>>,
  options: ConnectorPreflightOptions,
): Promise<DiagnosticCheck> {
  let endpoint;
  try {
    endpoint = materializeModelConnector(definition, configured);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: 'live:model', state: 'blocked',
      message: `Model endpoint configuration is not usable: ${message}`,
      remediation: 'Correct the model connector URL/model configuration, then run connectors test again.',
    };
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  try {
    const response = await fetchImpl(endpoint.url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(endpoint.timeoutMs ?? 30_000, 10_000)),
    });
    return {
      id: 'live:model', state: 'ok',
      message: `Configured model endpoint is reachable (HTTP ${response.status}).`,
      evidence: { protocol: endpoint.protocol, status: response.status },
    };
  } catch {
    return {
      id: 'live:model', state: 'blocked',
      message: 'Configured model endpoint could not be reached.',
      remediation: 'Start or connect the configured model service and verify the endpoint URL/network path, then run connectors test again.',
      evidence: { protocol: endpoint.protocol },
    };
  }
}

export async function runConnectorPreflight(
  home: string | undefined,
  connectorId: string,
  options: ConnectorPreflightOptions = {},
): Promise<ConnectorPreflightReport> {
  const definition = getBuiltInConnector(connectorId);
  if (!definition) throw new RuntimeError('NOT_FOUND', `Unknown connector: ${connectorId}`);
  const checks: DiagnosticCheck[] = [];
  const configured = getConfiguredConnector(home, connectorId);
  if (!configured) {
    checks.push({
      id: 'configuration',
      state: 'not-configured',
      message: `Connector ${connectorId} has not been added to this runtime.`,
      remediation: `Run q1x connectors add ${connectorId}.`,
    });
    return { connectorId, state: 'not-configured', checks };
  }
  checks.push({ id: 'configuration', state: 'ok', message: 'Connector configuration is present in local runtime state.' });
  checks.push(configured.enabled
    ? { id: 'enabled', state: 'ok', message: 'Connector is enabled.' }
    : { id: 'enabled', state: 'warning', message: 'Connector is configured but disabled.', remediation: `Run q1x connectors enable ${connectorId}.` });

  const host = expectedHostPlatform(options.platform ?? process.platform);
  if (!host || (!definition.platforms.includes('any') && !definition.platforms.includes(host))) {
    checks.push({
      id: 'platform',
      state: 'unsupported',
      message: `Connector ${connectorId} does not support host platform ${options.platform ?? process.platform}.`,
      remediation: 'Use a connector whose declared platform matches the current host.',
    });
    return { connectorId, state: aggregateDiagnosticState(checks), checks };
  }
  checks.push({ id: 'platform', state: 'ok', message: `Connector supports ${host}.` });

  const env = options.env ?? process.env;
  const exists = options.commandExists ?? (command => commandExistsOnPath(command, env));
  for (const command of definition.requirements.commands ?? []) {
    const available = await exists(command);
    checks.push(available
      ? { id: `command:${command}`, state: 'ok', message: `Required command is available: ${command}.` }
      : { id: `command:${command}`, state: 'blocked', message: `Required command is unavailable: ${command}.`, remediation: `Install or expose ${command} on PATH before enabling ${connectorId}.` });
  }

  for (const [logicalName, environmentKey] of Object.entries(configured.environmentKeys)) {
    const present = env[environmentKey] !== undefined;
    checks.push(present
      ? { id: `environment:${logicalName}`, state: 'ok', message: `Required environment reference is present: ${environmentKey}.`, evidence: { environmentKey, present: true } }
      : { id: `environment:${logicalName}`, state: 'blocked', message: `Required environment reference is missing: ${environmentKey}.`, remediation: `Set ${environmentKey} in the Q1X host environment.`, evidence: { environmentKey, present: false } });
  }

  if (definition.category === 'model' && configured.enabled) {
    checks.push(await modelReachabilityCheck(definition, configured, options));
  }

  if (definition.category === 'desktop' && definition.profile.platform) {
    const doctor = options.desktopDoctor ?? runDesktopDoctor;
    const native = await doctor(definition.profile.platform);
    for (const check of native.checks) {
      checks.push({
        id: `desktop:${check.id}`,
        state: check.state,
        message: check.message,
        ...(check.remediation ? { remediation: check.remediation } : {}),
      });
    }
  }

  checks.push({
    id: 'compatibility',
    state: definition.compatibility.status === 'tested' ? 'ok' : definition.compatibility.status === 'unsupported' ? 'unsupported' : 'warning',
    message: definition.compatibility.status === 'tested'
      ? 'Connector has tested compatibility evidence.'
      : definition.compatibility.note ?? `Connector compatibility is ${definition.compatibility.status}.`,
    ...(definition.compatibility.matrixId ? { evidence: { matrixId: definition.compatibility.matrixId } } : {}),
  });

  return { connectorId, state: aggregateDiagnosticState(checks), checks };
}
