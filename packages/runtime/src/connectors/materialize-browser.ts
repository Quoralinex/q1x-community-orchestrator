import { existsSync } from 'node:fs';
import type { BrowserEndpoint } from '@quoralinex/q1x-community-sdk';
import { assertSafeBrowserEndpoint } from '../browser-security.js';
import { RuntimeError } from '../errors.js';
import type { ConfiguredConnector } from './configuration.js';
import type { ConnectorDefinition } from './types.js';

interface BrowserProfileDocument {
  version: '1.0.0';
  kind: 'browser-managed-chromium' | 'browser-cdp-chromium';
  protocol: 'browser-playwright-managed' | 'browser-playwright-cdp';
  backend: 'playwright';
  mode: 'managed' | 'cdp';
  engine: 'chromium';
  defaultHeadless?: boolean;
  defaultTimeoutMs: number;
}

export interface ChromiumDetectionOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export interface BrowserMaterializationOptions extends ChromiumDetectionOptions {}

const profiles: Record<BrowserProfileDocument['kind'], BrowserProfileDocument> = {
  'browser-managed-chromium': Object.freeze({
    version: '1.0.0', kind: 'browser-managed-chromium', protocol: 'browser-playwright-managed',
    backend: 'playwright', mode: 'managed', engine: 'chromium', defaultHeadless: true, defaultTimeoutMs: 30_000,
  }),
  'browser-cdp-chromium': Object.freeze({
    version: '1.0.0', kind: 'browser-cdp-chromium', protocol: 'browser-playwright-cdp',
    backend: 'playwright', mode: 'cdp', engine: 'chromium', defaultTimeoutMs: 30_000,
  }),
};

export function chromiumExecutableCandidates(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string[] {
  if (platform === 'darwin') return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  if (platform === 'win32') {
    const programFiles = env.PROGRAMFILES ?? 'C:\\Program Files';
    const programFilesX86 = env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = env.LOCALAPPDATA;
    return [
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ...(localAppData ? [
        `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
        `${localAppData}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ] : []),
    ];
  }
  if (platform === 'linux') return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
  return [];
}

export function detectChromiumExecutable(options: ChromiumDetectionOptions = {}): string {
  const env = options.env ?? process.env;
  const override = env.Q1X_BROWSER_EXECUTABLE;
  if (override) {
    if (!existsSync(override)) throw new RuntimeError('NOT_FOUND', `Configured Chromium executable does not exist: ${override}`);
    return override;
  }
  const candidate = chromiumExecutableCandidates(options.platform ?? process.platform, env).find(path => existsSync(path));
  if (!candidate) throw new RuntimeError('NOT_FOUND', 'No supported Chromium browser was detected; set Q1X_BROWSER_EXECUTABLE or configure executablePath');
  return candidate;
}

function timeout(parameters: Record<string, unknown>, fallback: number): number {
  const value = parameters.timeoutMs;
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 600_000) {
    throw new RuntimeError('INVALID_REFERENCE', 'Browser connector timeoutMs must be an integer between 1 and 600000');
  }
  return value;
}

function optionalPath(parameters: Record<string, unknown>, key: string): string | undefined {
  const value = parameters[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new RuntimeError('INVALID_REFERENCE', `Browser connector ${key} must be a non-empty absolute path`);
  return value.trim();
}

function headless(parameters: Record<string, unknown>, fallback: boolean): boolean {
  const value = parameters.headless;
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new RuntimeError('INVALID_REFERENCE', 'Browser connector headless must be boolean');
  return value;
}

function requiredCdpUrl(parameters: Record<string, unknown>): string {
  const value = parameters.cdpUrl;
  if (typeof value !== 'string' || !value.trim()) throw new RuntimeError('INVALID_REFERENCE', 'Browser connector cdpUrl is required');
  return value.trim();
}

export function loadBrowserConnectorProfile(kind: string): BrowserProfileDocument {
  const profile = profiles[kind as BrowserProfileDocument['kind']];
  if (!profile) throw new RuntimeError('NOT_FOUND', `Unknown browser connector profile: ${kind}`);
  return structuredClone(profile);
}

export function materializeBrowserConnector(
  definition: ConnectorDefinition,
  configuration: ConfiguredConnector,
  options: BrowserMaterializationOptions = {},
): BrowserEndpoint {
  if (definition.category !== 'browser') throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} is not a browser connector`);
  if (configuration.id !== definition.id) throw new RuntimeError('INVALID_REFERENCE', 'Connector definition/configuration id mismatch');
  if (configuration.profile !== definition.profile.kind) throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} requires profile ${definition.profile.kind}`);
  const profile = loadBrowserConnectorProfile(definition.profile.kind);
  if (definition.protocol !== profile.protocol) throw new RuntimeError('INVALID_REFERENCE', `Connector ${definition.id} protocol does not match browser profile`);

  const endpoint: BrowserEndpoint = profile.mode === 'managed' ? {
    contractVersion: '1.0.0',
    id: `browser.${definition.id}`,
    name: `${definition.name} endpoint`,
    backend: profile.backend,
    mode: 'managed',
    engine: profile.engine,
    headless: headless(configuration.parameters, profile.defaultHeadless ?? true),
    executablePath: optionalPath(configuration.parameters, 'executablePath') ?? detectChromiumExecutable(options),
    ...(optionalPath(configuration.parameters, 'userDataDir') ? { userDataDir: optionalPath(configuration.parameters, 'userDataDir') } : {}),
    ...(optionalPath(configuration.parameters, 'downloadDir') ? { downloadDir: optionalPath(configuration.parameters, 'downloadDir') } : {}),
    timeoutMs: timeout(configuration.parameters, profile.defaultTimeoutMs),
    metadata: { connectorId: definition.id, profile: profile.kind, detection: configuration.parameters.executablePath ? 'configured' : 'automatic' },
  } : {
    contractVersion: '1.0.0',
    id: `browser.${definition.id}`,
    name: `${definition.name} endpoint`,
    backend: profile.backend,
    mode: 'cdp',
    engine: profile.engine,
    cdpUrl: requiredCdpUrl(configuration.parameters),
    timeoutMs: timeout(configuration.parameters, profile.defaultTimeoutMs),
    metadata: { connectorId: definition.id, profile: profile.kind },
  };
  assertSafeBrowserEndpoint(endpoint);
  return endpoint;
}
