import type { AdapterEndpoint, AdapterHttpTransport, AdapterStdioTransport } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

const sensitiveHeaders = new Set(['authorization', 'proxy-authorization', 'x-api-key', 'api-key']);

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return true;
  const parts = host.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export function assertSafeAdapterEndpoint(endpoint: AdapterEndpoint): void {
  if (endpoint.transport.kind === 'stdio') return;
  let url: URL;
  try { url = new URL(endpoint.transport.url); }
  catch { throw new RuntimeError('INSECURE_ENDPOINT', 'Adapter endpoint URL is invalid'); }
  if (url.username || url.password) throw new RuntimeError('INSECURE_ENDPOINT', 'Credentials must not be embedded in adapter URLs');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new RuntimeError('INSECURE_ENDPOINT', 'Remote adapter endpoints must use HTTPS');
  }
  for (const header of Object.keys(endpoint.transport.staticHeaders ?? {})) {
    if (sensitiveHeaders.has(header.toLowerCase())) throw new RuntimeError('INSECURE_ENDPOINT', `Sensitive header ${header} must use an environment reference`);
  }
}
export function resolveAdapterHeaders(transport: AdapterHttpTransport, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const headers: Record<string, string> = { ...(transport.staticHeaders ?? {}) };
  for (const credential of transport.credentials ?? []) {
    const value = env[credential.environmentKey];
    if (!value) throw new RuntimeError('MISSING_CREDENTIAL', `Required credential environment key is not set: ${credential.environmentKey}`);
    headers[credential.header] = `${credential.prefix ?? ''}${value}`;
  }
  return headers;
}

export function resolveAdapterEnvironment(transport: AdapterStdioTransport, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP']) {
    if (env[key] !== undefined) result[key] = env[key];
  }
  for (const mapping of transport.environment ?? []) {
    const value = env[mapping.environmentKey];
    if (!value) throw new RuntimeError('MISSING_CREDENTIAL', `Required environment key is not set: ${mapping.environmentKey}`);
    result[mapping.name] = value;
  }
  return result;
}
