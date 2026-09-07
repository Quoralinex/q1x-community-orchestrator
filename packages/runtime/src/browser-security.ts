import { isAbsolute } from 'node:path';
import type { BrowserEndpoint } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return true;
  const parts = host.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function assertAbsolute(path: string | undefined, label: string): void {
  if (path && !isAbsolute(path)) throw new RuntimeError('INSECURE_ENDPOINT', `${label} must be an absolute path`);
}

export function assertSafeBrowserEndpoint(endpoint: BrowserEndpoint): void {
  assertAbsolute(endpoint.downloadDir, 'Browser downloadDir');
  assertAbsolute(endpoint.userDataDir, 'Browser userDataDir');
  assertAbsolute(endpoint.executablePath, 'Browser executablePath');
  for (const root of endpoint.fileAccessRoots ?? []) assertAbsolute(root, 'Browser fileAccessRoot');
  if (endpoint.mode !== 'cdp') return;
  let url: URL;
  try { url = new URL(endpoint.cdpUrl ?? ''); }
  catch { throw new RuntimeError('INSECURE_ENDPOINT', 'Browser CDP URL is invalid'); }
  if (url.username || url.password) throw new RuntimeError('INSECURE_ENDPOINT', 'Credentials must not be embedded in browser CDP URLs');
  const secure = url.protocol === 'https:' || url.protocol === 'wss:';
  const local = (url.protocol === 'http:' || url.protocol === 'ws:') && isLoopback(url.hostname);
  if (!secure && !local) throw new RuntimeError('INSECURE_ENDPOINT', 'Remote browser CDP endpoints must use HTTPS or WSS');
}


export function assertSafeBrowserNavigation(endpoint: BrowserEndpoint, rawUrl: string): URL {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new RuntimeError('INSECURE_ENDPOINT', 'Browser navigation URL is invalid'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new RuntimeError('INSECURE_ENDPOINT', 'Browser navigation permits only HTTP and HTTPS URLs');
  }
  const origin = url.origin;
  if (endpoint.navigation?.blockedOrigins?.includes(origin)) {
    throw new RuntimeError('INSECURE_ENDPOINT', `Browser navigation origin is blocked: ${origin}`);
  }
  const allowed = endpoint.navigation?.allowedOrigins;
  if (allowed?.length && !allowed.includes(origin)) {
    throw new RuntimeError('INSECURE_ENDPOINT', `Browser navigation origin is not allowlisted: ${origin}`);
  }
  return url;
}
