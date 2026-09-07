import { relative, resolve } from 'node:path';
import type { DesktopActionBatch, DesktopEndpoint } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

function platformName(): 'macos' | 'windows' | 'linux' {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  return 'linux';
}

export function isDesktopEndpointPlatformCompatible(endpoint: DesktopEndpoint): boolean {
  return endpoint.platform === 'any' || endpoint.platform === platformName();
}

function within(root: string, candidate: string): boolean {
  const base = resolve(root);
  const target = resolve(candidate);
  const rel = relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !rel.includes(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

export function assertSafeDesktopEndpoint(endpoint: DesktopEndpoint): void {
  if (!endpoint.transport.command.trim()) throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop bridge command is required');
  const names = new Set<string>();
  for (const mapping of endpoint.transport.environment ?? []) {
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

export function assertSafeDesktopBatch(endpoint: DesktopEndpoint, batch: DesktopActionBatch): void {
  for (const action of batch.actions) {
    if (action.application) assertApplicationAllowed(endpoint, action.application);
    if (action.kind === 'screenshot') {
      if (!endpoint.outputDir) throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop screenshots require an endpoint outputDir');
      if (!action.outputPath || !within(endpoint.outputDir, action.outputPath)) {
        throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop screenshot output must remain beneath endpoint outputDir');
      }
    }
  }
}

export function resolveDesktopEnvironment(endpoint: DesktopEndpoint, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
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
