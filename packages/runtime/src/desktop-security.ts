import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import type { DesktopActionBatch, DesktopEndpoint, DesktopPlatform } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

export function desktopPlatformForHost(hostPlatform: NodeJS.Platform = process.platform): Exclude<DesktopPlatform, 'any'> | undefined {
  if (hostPlatform === 'darwin') return 'macos';
  if (hostPlatform === 'win32') return 'windows';
  if (hostPlatform === 'linux') return 'linux';
  return undefined;
}

export function isDesktopEndpointPlatformCompatible(endpoint: DesktopEndpoint, hostPlatform: NodeJS.Platform = process.platform): boolean {
  const host = desktopPlatformForHost(hostPlatform);
  return host !== undefined && (endpoint.platform === 'any' || endpoint.platform === host);
}

export function isDesktopPathWithin(root: string, candidate: string, style: 'native' | 'win32' = 'native'): boolean {
  const base = style === 'win32' ? win32.resolve(root) : resolve(root);
  const target = style === 'win32' ? win32.resolve(candidate) : resolve(candidate);
  const rel = style === 'win32' ? win32.relative(base, target) : relative(base, target);
  const absolute = style === 'win32' ? win32.isAbsolute(rel) : isAbsolute(rel);
  const separator = style === 'win32' ? win32.sep : sep;
  return rel === '' || (!absolute && rel !== '..' && !rel.startsWith(`..${separator}`));
}

export function assertSafeDesktopEndpoint(endpoint: DesktopEndpoint): void {
  if (endpoint.backend === 'stdio-bridge') {
    if (!endpoint.transport?.command.trim()) throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop stdio bridge command is required');
  }
  const names = new Set<string>();
  for (const mapping of endpoint.transport?.environment ?? []) {
    if (names.has(mapping.name)) throw new RuntimeError('INSECURE_ENDPOINT', `Desktop environment mapping is duplicated: ${mapping.name}`);
    names.add(mapping.name);
  }
  const allowed = new Set(endpoint.applicationPolicy?.allowedApplications ?? []);
  for (const blocked of endpoint.applicationPolicy?.blockedApplications ?? []) {
    if (allowed.has(blocked)) throw new RuntimeError('INSECURE_ENDPOINT', `Application cannot be both allowed and blocked: ${blocked}`);
  }
}

function assertApplicationAllowed(endpoint: DesktopEndpoint, application: string): void {
  const policy = endpoint.applicationPolicy;
  if (!policy) return;
  if (policy.blockedApplications?.includes(application)) {
    throw new RuntimeError('INSECURE_ENDPOINT', `Desktop application is blocked by endpoint policy: ${application}`);
  }
  if (policy.allowedApplications && policy.allowedApplications.length > 0 && !policy.allowedApplications.includes(application)) {
    throw new RuntimeError('INSECURE_ENDPOINT', `Desktop application is not allowed by endpoint policy: ${application}`);
  }
}

function hasApplicationRestriction(endpoint: DesktopEndpoint): boolean {
  const policy = endpoint.applicationPolicy;
  return Boolean((policy?.allowedApplications?.length ?? 0) > 0 || (policy?.blockedApplications?.length ?? 0) > 0);
}

export function assertSafeDesktopBatch(endpoint: DesktopEndpoint, batch: DesktopActionBatch): DesktopActionBatch {
  const restricted = hasApplicationRestriction(endpoint);
  const actions = batch.actions.map(action => {
    if (!endpoint.supportedActions.includes(action.kind)) {
      throw new RuntimeError('INSECURE_ENDPOINT', `Desktop action is not declared supported by endpoint: ${action.kind}`);
    }
    if (restricted && !action.application) {
      throw new RuntimeError('INSECURE_ENDPOINT', `Desktop action must identify an application under endpoint policy: ${action.id}`);
    }
    if (action.application) assertApplicationAllowed(endpoint, action.application);
    if (action.kind === 'screenshot') {
      if (!endpoint.outputDir) throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop screenshots require an endpoint outputDir');
      if (!action.outputPath || !isDesktopPathWithin(endpoint.outputDir, action.outputPath)) {
        throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop screenshot output must remain beneath endpoint outputDir');
      }
      return { ...action, outputPath: resolve(action.outputPath) };
    }
    return action;
  });
  return { ...batch, actions };
}

export function resolveDesktopEnvironment(endpoint: DesktopEndpoint, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (!endpoint.transport) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Desktop stdio transport configuration is missing');
  const result: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP']) {
    if (env[key] !== undefined) result[key] = env[key];
  }
  for (const mapping of endpoint.transport.environment ?? []) {
    const value = env[mapping.environmentKey];
    if (value === undefined) throw new RuntimeError('MISSING_CREDENTIAL', `Required desktop environment key is not set: ${mapping.environmentKey}`);
    result[mapping.name] = value;
  }
  return result;
}
