import type { ModelEndpoint } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

const sensitiveHeaders = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'api-key'
]);

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return true;
  const parts = host.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export function assertSafeEndpointUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new RuntimeError('INSECURE_ENDPOINT', 'Model endpoint URL is invalid'); }
  if (url.username || url.password) throw new RuntimeError('INSECURE_ENDPOINT', 'Credentials must not be embedded in endpoint URLs');
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && isLoopback(url.hostname)) return url;
  throw new RuntimeError('INSECURE_ENDPOINT', 'Remote model endpoints must use HTTPS');
}

export function assertSafeEndpointConfiguration(endpoint: ModelEndpoint): void {
  assertSafeEndpointUrl(endpoint.url);
  for (const header of Object.keys(endpoint.staticHeaders ?? {})) {
    if (sensitiveHeaders.has(header.toLowerCase())) {
      throw new RuntimeError('INSECURE_ENDPOINT', `Sensitive header ${header} must use a credential environment reference`);
    }
  }
}

export function resolveEndpointHeaders(endpoint: ModelEndpoint, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  assertSafeEndpointConfiguration(endpoint);
  const headers: Record<string, string> = { ...(endpoint.staticHeaders ?? {}) };
  for (const credential of endpoint.credentials ?? []) {
    const secret = env[credential.environmentKey];
    if (!secret) {
      throw new RuntimeError('MISSING_CREDENTIAL', `Required credential environment key is not set: ${credential.environmentKey}`);
    }
    headers[credential.header] = `${credential.prefix ?? ''}${secret}`;
  }
  return headers;
}
