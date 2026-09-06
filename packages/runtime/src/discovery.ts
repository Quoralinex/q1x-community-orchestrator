import { accessSync, constants, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  CapabilityDescriptor,
  DiscoveryManifest,
  DiscoveryProbe,
  Platform
} from '@quoralinex/q1x-community-sdk';

export interface DiscoveryContext {
  platform?: Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

export interface ProbeResult {
  kind: DiscoveryProbe['kind'];
  applicable: boolean;
  success: boolean;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface DiscoveryResult {
  manifestId: string;
  capability: CapabilityDescriptor;
  probes: ProbeResult[];
}
function currentPlatform(): Platform {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'linux') return 'linux';
  return 'any';
}

function applies(platforms: Platform[] | undefined, platform: Platform): boolean {
  return !platforms || platforms.includes('any') || platforms.includes(platform);
}

function expandHome(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(home, value.slice(2));
  return value;
}

function executableExists(file: string, platform: Platform): boolean {
  try {
    accessSync(file, platform === 'windows' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCommand(name: string, env: NodeJS.ProcessEnv, platform: Platform): string | undefined {
  if (isAbsolute(name)) return executableExists(name, platform) ? name : undefined;
  const dirs = (env.PATH ?? env.Path ?? env.path ?? '').split(delimiter).filter(Boolean);
  const extensions = platform === 'windows'
    ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];
  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = join(dir, platform === 'windows' && !name.toUpperCase().endsWith(ext.toUpperCase()) ? `${name}${ext}` : name);
      if (executableExists(candidate, platform)) return candidate;
    }
  }
  return undefined;
}
function commandProbe(probe: Extract<DiscoveryProbe, { kind: 'command' }>, platform: Platform, env: NodeJS.ProcessEnv): ProbeResult {
  for (const name of probe.names) {
    const resolved = resolveCommand(name, env, platform);
    if (!resolved) continue;
    if (!probe.versionArgs || probe.versionArgs.length === 0) {
      return { kind: 'command', applicable: true, success: true, detail: `resolved ${name}`, metadata: { executable: resolved } };
    }
    const child = spawnSync(resolved, probe.versionArgs, {
      env, encoding: 'utf8', shell: false, timeout: probe.timeoutMs ?? 2000,
      windowsHide: true
    });
    if (child.status === 0) {
      const version = `${child.stdout ?? ''}${child.stderr ?? ''}`.trim().split(/\r?\n/, 1)[0]?.slice(0, 240);
      return { kind: 'command', applicable: true, success: true, detail: version || `executed ${name}`, metadata: { executable: resolved } };
    }
    return { kind: 'command', applicable: true, success: false, detail: `resolved ${name} but version check failed`, metadata: { executable: resolved } };
  }
  return { kind: 'command', applicable: true, success: false, detail: 'no declared executable resolved' };
}

function pathProbe(probe: Extract<DiscoveryProbe, { kind: 'path' }>, home: string): ProbeResult {
  const matches = probe.paths.map(value => expandHome(value, home)).filter(value => existsSync(value));
  return matches.length > 0
    ? { kind: 'path', applicable: true, success: true, detail: `${matches.length} path match(es)`, metadata: { paths: matches } }
    : { kind: 'path', applicable: true, success: false, detail: 'no declared path exists' };
}

function environmentProbe(probe: Extract<DiscoveryProbe, { kind: 'environment' }>, env: NodeJS.ProcessEnv): ProbeResult {
  const present = probe.keys.filter(key => env[key] !== undefined && env[key] !== '');
  const success = (probe.match ?? 'all') === 'any' ? present.length > 0 : present.length === probe.keys.length;
  return { kind: 'environment', applicable: true, success, detail: `${present.length}/${probe.keys.length} configuration key(s) present`, metadata: { presentKeys: present } };
}

async function httpProbe(probe: Extract<DiscoveryProbe, { kind: 'http' }>): Promise<ProbeResult> {
  let url: URL;
  try {
    url = new URL(probe.url);
  } catch {
    return { kind: 'http', applicable: true, success: false, detail: 'invalid URL' };
  }
  if (url.username || url.password) {
    return { kind: 'http', applicable: true, success: false, detail: 'embedded URL credentials are not allowed' };
  }
  try {
    const response = await fetch(url, {
      method: probe.method ?? 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(probe.timeoutMs ?? 1500)
    });
    const accepted = probe.acceptedStatus ?? [];
    const success = accepted.length > 0 ? accepted.includes(response.status) : response.status >= 200 && response.status < 300;
    return { kind: 'http', applicable: true, success, detail: `HTTP ${response.status}`, metadata: { status: response.status } };
  } catch (error) {
    return { kind: 'http', applicable: true, success: false, detail: error instanceof Error ? error.name : 'request failed' };
  }
}

export async function runProbe(probe: DiscoveryProbe, context: DiscoveryContext = {}): Promise<ProbeResult> {
  const platform = context.platform ?? currentPlatform();
  if (!applies(probe.platforms, platform)) return { kind: probe.kind, applicable: false, success: false, detail: 'probe not applicable on this platform' };
  const env = context.env ?? process.env;
  const home = context.home ?? homedir();
  if (probe.kind === 'command') return commandProbe(probe, platform, env);
  if (probe.kind === 'path') return pathProbe(probe, home);
  if (probe.kind === 'environment') return environmentProbe(probe, env);
  return httpProbe(probe);
}

export async function discoverManifest(manifest: DiscoveryManifest, context: DiscoveryContext = {}): Promise<DiscoveryResult> {
  const platform = context.platform ?? currentPlatform();
  const manifestApplicable = applies(manifest.platforms, platform);
  const probes = manifestApplicable
    ? await Promise.all(manifest.probes.map(probe => runProbe(probe, context)))
    : manifest.probes.map(probe => ({ kind: probe.kind, applicable: false, success: false, detail: 'manifest not applicable on this platform' } as ProbeResult));
  const applicable = probes.filter(probe => probe.applicable);
  const activated = applicable.length > 0 && (manifest.activation === 'any'
    ? applicable.some(probe => probe.success)
    : applicable.every(probe => probe.success));
  const availability = applicable.length === 0 ? 'unknown' : activated ? 'available' : 'offline';
  const trust = activated && manifest.capability.trust.level === 'unverified'
    ? { ...manifest.capability.trust, level: 'discovered' as const }
    : manifest.capability.trust;
  const checkedAt = new Date().toISOString();
  const capability: CapabilityDescriptor = {
    contractVersion: '1.0.0',
    ...manifest.capability,
    availability: { state: availability, checkedAt, detail: `${applicable.filter(probe => probe.success).length}/${applicable.length} applicable probe(s) succeeded` },
    trust,
    metadata: { ...manifest.capability.metadata, discovery: { manifestId: manifest.id, checkedAt, platform, probes } }
  };
  return { manifestId: manifest.id, capability, probes };
}
