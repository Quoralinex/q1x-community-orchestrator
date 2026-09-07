import { CONTRACT_VERSION } from '@quoralinex/q1x-community-contracts';
import type { AdapterEndpoint, CapabilityDescriptor, ExecutionRequest, ExecutionResult } from '@quoralinex/q1x-community-sdk';
import { assertSafeAdapterEndpoint, resolveAdapterHeaders } from './adapter-security.js';
import type { AdapterTransport, AdapterTransportContext } from './adapter-transport.js';
import { RuntimeError } from './errors.js';

type JsonRecord = Record<string, unknown>;

interface WebDriverCommand {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
}

interface WebDriverReply {
  ok: boolean;
  status: number;
  value: unknown;
  errorCode?: string;
  errorMessage?: string;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `${label} must be an object`);
  }
  return value as JsonRecord;
}

function requiredString(input: JsonRecord, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `WebDriver action requires ${key}`);
  }
  return value;
}

function browserTransport(endpoint: AdapterEndpoint) {
  if (endpoint.adapterKind !== 'browser-control') {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'WebDriver protocol requires a browser-control endpoint');
  }
  if (endpoint.transport.kind !== 'http') {
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'WebDriver adapter requires an HTTP transport');
  }
  assertSafeAdapterEndpoint(endpoint);
  return endpoint.transport;
}

function baseUrl(endpoint: AdapterEndpoint): URL {
  const transport = browserTransport(endpoint);
  const base = new URL(transport.url);
  if (!base.pathname.endsWith('/')) base.pathname = `${base.pathname}/`;
  return base;
}

function endpointUrl(endpoint: AdapterEndpoint, path: string): string {
  const target = new URL(path.replace(/^\/+/, ''), baseUrl(endpoint));
  assertSafeAdapterEndpoint({ ...endpoint, transport: { ...browserTransport(endpoint), url: target.toString() } });
  return target.toString();
}

function sessionPath(input: JsonRecord, suffix = ''): string {
  const sessionId = encodeURIComponent(requiredString(input, 'sessionId'));
  return `session/${sessionId}${suffix}`;
}

function elementPath(input: JsonRecord, suffix = ''): string {
  const elementId = encodeURIComponent(requiredString(input, 'elementId'));
  return `${sessionPath(input)}/element/${elementId}${suffix}`;
}

function commandFor(input: JsonRecord): WebDriverCommand {
  const action = requiredString(input, 'action');
  switch (action) {
    case 'status': return { method: 'GET', path: 'status' };
    case 'newSession': return {
      method: 'POST', path: 'session',
      body: { capabilities: input.capabilities ?? { alwaysMatch: {} } }
    };
    case 'deleteSession': return { method: 'DELETE', path: sessionPath(input) };
    case 'navigate': return { method: 'POST', path: `${sessionPath(input)}/url`, body: { url: requiredString(input, 'url') } };
    case 'currentUrl': return { method: 'GET', path: `${sessionPath(input)}/url` };
    case 'title': return { method: 'GET', path: `${sessionPath(input)}/title` };
    case 'pageSource': return { method: 'GET', path: `${sessionPath(input)}/source` };
    case 'findElement': return {
      method: 'POST', path: `${sessionPath(input)}/element`,
      body: { using: typeof input.using === 'string' ? input.using : 'css selector', value: requiredString(input, 'value') }
    };
    case 'findElements': return {
      method: 'POST', path: `${sessionPath(input)}/elements`,
      body: { using: typeof input.using === 'string' ? input.using : 'css selector', value: requiredString(input, 'value') }
    };
    case 'activeElement': return { method: 'GET', path: `${sessionPath(input)}/element/active` };
    case 'click': return { method: 'POST', path: `${elementPath(input)}/click`, body: {} };
    case 'sendKeys': {
      const text = requiredString(input, 'text');
      return { method: 'POST', path: `${elementPath(input)}/value`, body: { text, value: [...text] } };
    }
    case 'elementText': return { method: 'GET', path: `${elementPath(input)}/text` };
    case 'elementAttribute': return {
      method: 'GET', path: `${elementPath(input)}/attribute/${encodeURIComponent(requiredString(input, 'name'))}`
    };
    case 'screenshot': return { method: 'GET', path: `${sessionPath(input)}/screenshot` };
    case 'executeScript': return {
      method: 'POST', path: `${sessionPath(input)}/execute/sync`,
      body: { script: requiredString(input, 'script'), args: Array.isArray(input.args) ? input.args : [] }
    };
    case 'executeAsyncScript': return {
      method: 'POST', path: `${sessionPath(input)}/execute/async`,
      body: { script: requiredString(input, 'script'), args: Array.isArray(input.args) ? input.args : [] }
    };
    case 'back': return { method: 'POST', path: `${sessionPath(input)}/back`, body: {} };
    case 'forward': return { method: 'POST', path: `${sessionPath(input)}/forward`, body: {} };
    case 'refresh': return { method: 'POST', path: `${sessionPath(input)}/refresh`, body: {} };
    case 'windowHandles': return { method: 'GET', path: `${sessionPath(input)}/window/handles` };
    case 'switchWindow': return { method: 'POST', path: `${sessionPath(input)}/window`, body: { handle: requiredString(input, 'handle') } };
    case 'closeWindow': return { method: 'DELETE', path: `${sessionPath(input)}/window` };
    case 'getCookies': return { method: 'GET', path: `${sessionPath(input)}/cookie` };
    case 'addCookie': return { method: 'POST', path: `${sessionPath(input)}/cookie`, body: { cookie: record(input.cookie, 'cookie') } };
    case 'deleteCookies': return {
      method: 'DELETE',
      path: typeof input.name === 'string' && input.name.length > 0
        ? `${sessionPath(input)}/cookie/${encodeURIComponent(input.name)}`
        : `${sessionPath(input)}/cookie`
    };
    case 'performActions': return {
      method: 'POST', path: `${sessionPath(input)}/actions`,
      body: { actions: Array.isArray(input.actions) ? input.actions : [] }
    };
    case 'releaseActions': return { method: 'DELETE', path: `${sessionPath(input)}/actions` };
    case 'switchFrame': return { method: 'POST', path: `${sessionPath(input)}/frame`, body: { id: input.id ?? null } };
    case 'switchParentFrame': return { method: 'POST', path: `${sessionPath(input)}/frame/parent`, body: {} };
    case 'getTimeouts': return { method: 'GET', path: `${sessionPath(input)}/timeouts` };
    case 'setTimeouts': return {
      method: 'POST', path: `${sessionPath(input)}/timeouts`,
      body: {
        ...(typeof input.script === 'number' ? { script: input.script } : {}),
        ...(typeof input.pageLoad === 'number' ? { pageLoad: input.pageLoad } : {}),
        ...(typeof input.implicit === 'number' ? { implicit: input.implicit } : {})
      }
    };
    case 'getWindowRect': return { method: 'GET', path: `${sessionPath(input)}/window/rect` };
    case 'setWindowRect': return {
      method: 'POST', path: `${sessionPath(input)}/window/rect`,
      body: {
        ...(typeof input.x === 'number' ? { x: input.x } : {}),
        ...(typeof input.y === 'number' ? { y: input.y } : {}),
        ...(typeof input.width === 'number' ? { width: input.width } : {}),
        ...(typeof input.height === 'number' ? { height: input.height } : {})
      }
    };
    case 'maximizeWindow': return { method: 'POST', path: `${sessionPath(input)}/window/maximize`, body: {} };
    case 'minimizeWindow': return { method: 'POST', path: `${sessionPath(input)}/window/minimize`, body: {} };
    case 'fullscreenWindow': return { method: 'POST', path: `${sessionPath(input)}/window/fullscreen`, body: {} };
    case 'getAlertText': return { method: 'GET', path: `${sessionPath(input)}/alert/text` };
    case 'acceptAlert': return { method: 'POST', path: `${sessionPath(input)}/alert/accept`, body: {} };
    case 'dismissAlert': return { method: 'POST', path: `${sessionPath(input)}/alert/dismiss`, body: {} };
    case 'sendAlertText': return { method: 'POST', path: `${sessionPath(input)}/alert/text`, body: { text: requiredString(input, 'text') } };
    default: throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `Unsupported WebDriver action: ${action}`);
  }
}

function webdriverError(value: unknown): { code?: string; message?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const item = value as JsonRecord;
  return {
    ...(typeof item.error === 'string' ? { code: item.error } : {}),
    ...(typeof item.message === 'string' ? { message: item.message } : {})
  };
}

async function callWebDriver(endpoint: AdapterEndpoint, command: WebDriverCommand, context: AdapterTransportContext): Promise<WebDriverReply> {
  const transport = browserTransport(endpoint);
  const fetchImpl = context.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = resolveAdapterHeaders(transport, context.env ?? process.env);
  if (command.body !== undefined) headers['content-type'] = 'application/json';

  try {
    const response = await fetchImpl(endpointUrl(endpoint, command.path), {
      method: command.method,
      headers,
      ...(command.body !== undefined ? { body: JSON.stringify(command.body) } : {}),
      redirect: 'manual',
      signal: context.signal ?? AbortSignal.timeout(transport.timeoutMs ?? 30000)
    });
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'WebDriver endpoint returned invalid JSON'); }
    const root = record(payload, 'WebDriver response');
    const value = root.value;
    const error = webdriverError(value);
    return {
      ok: response.ok && !error.code,
      status: response.status,
      value,
      ...(error.code ? { errorCode: error.code } : {}),
      ...(error.message ? { errorMessage: error.message } : {})
    };
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    const kind = error instanceof Error ? error.name : 'Error';
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `WebDriver request failed (${kind})`);
  }
}

function safeCode(value: string | undefined): string {
  return (value ?? 'transport-error').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'TRANSPORT_ERROR';
}

function isLocal(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}

const browserOperations = [
  'status', 'newSession', 'deleteSession', 'navigate', 'currentUrl', 'title', 'pageSource',
  'findElement', 'findElements', 'activeElement', 'click', 'sendKeys', 'elementText',
  'elementAttribute', 'screenshot', 'executeScript', 'executeAsyncScript', 'back', 'forward',
  'refresh', 'windowHandles', 'switchWindow', 'closeWindow', 'getCookies', 'addCookie',
  'deleteCookies', 'performActions', 'releaseActions', 'switchFrame', 'switchParentFrame',
  'getTimeouts', 'setTimeouts', 'getWindowRect', 'setWindowRect', 'maximizeWindow',
  'minimizeWindow', 'fullscreenWindow', 'getAlertText', 'acceptAlert', 'dismissAlert', 'sendAlertText'
];

class WebDriverHttpTransport implements AdapterTransport {
  readonly protocol = 'webdriver-http-v1';

  async execute(endpoint: AdapterEndpoint, request: ExecutionRequest, context: AdapterTransportContext = {}): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const input = record(request.input, 'WebDriver input');
    const reply = await callWebDriver(endpoint, commandFor(input), context);
    const finishedAt = new Date().toISOString();
    if (!reply.ok) {
      return {
        contractVersion: CONTRACT_VERSION,
        id: `${request.id}.result`, requestId: request.id, workItemId: request.workItemId,
        status: 'failed',
        error: {
          code: `WEBDRIVER_${safeCode(reply.errorCode ?? String(reply.status))}`,
          message: reply.errorMessage ?? `WebDriver command failed with HTTP ${reply.status}`,
          retryable: reply.status >= 500
        },
        usage: { durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) },
        startedAt, finishedAt
      };
    }
    return {
      contractVersion: CONTRACT_VERSION,
      id: `${request.id}.result`, requestId: request.id, workItemId: request.workItemId,
      status: 'succeeded', output: reply.value,
      usage: { durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) },
      startedAt, finishedAt
    };
  }

  async discover(endpoint: AdapterEndpoint, context: AdapterTransportContext = {}): Promise<readonly CapabilityDescriptor[]> {
    const reply = await callWebDriver(endpoint, { method: 'GET', path: 'status' }, context);
    if (!reply.ok) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'WebDriver status endpoint is not ready');
    const checkedAt = new Date().toISOString();
    const endpointId = endpoint.id.replace(/[^A-Za-z0-9._:-]+/g, '-');
    return [{
      contractVersion: CONTRACT_VERSION,
      id: `capability.${endpointId}.browser-control`,
      name: `${endpoint.name}: browser control`,
      adapterKind: 'browser-control',
      operations: browserOperations,
      modalities: { input: ['structured-data', 'text', 'control'], output: ['structured-data', 'text', 'image'] },
      availability: { state: 'available', checkedAt },
      cost: { class: 'unknown' },
      privacy: { executionLocation: isLocal(browserTransport(endpoint).url) ? 'local' : 'public-cloud', dataRetention: 'unknown' },
      trust: { level: 'configured', source: browserTransport(endpoint).url },
      platforms: ['web'],
      metadata: { endpointId: endpoint.id, protocol: this.protocol, status: reply.value }
    }];
  }
}

export function createBrowserAdapterTransport(): AdapterTransport {
  return new WebDriverHttpTransport();
}
