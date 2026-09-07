import { CONTRACT_VERSION } from '@quoralinex/q1x-community-contracts';
import type { AdapterEndpoint, CapabilityDescriptor, ExecutionRequest, ExecutionResult } from '@quoralinex/q1x-community-sdk';
import { assertSafeAdapterEndpoint, resolveAdapterHeaders } from './adapter-security.js';
import type { AdapterTransport, AdapterTransportContext } from './adapter-transport.js';
import { RuntimeError } from './errors.js';

interface JsonRecord { [key: string]: unknown; }
function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'A2A endpoint returned invalid JSON');
  return value as JsonRecord;
}
function text(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function safeId(value: string): string { return value.replace(/[^A-Za-z0-9._:-]+/g, '-').slice(0, 80) || 'skill'; }

function httpTransport(endpoint: AdapterEndpoint) {
  if (endpoint.transport.kind !== 'http') throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'A2A adapter requires an HTTP transport');
  assertSafeAdapterEndpoint(endpoint);
  return endpoint.transport;
}

async function fetchJson(endpoint: AdapterEndpoint, url: string, init: RequestInit, context: AdapterTransportContext): Promise<JsonRecord> {
  const transport = httpTransport(endpoint);
  assertSafeAdapterEndpoint({ ...endpoint, transport: { ...transport, url } });
  const fetchImpl = context.fetch ?? globalThis.fetch;
  try {
    const response = await fetchImpl(url, { ...init, redirect: 'manual', signal: context.signal ?? AbortSignal.timeout(transport.timeoutMs ?? 30000) });
    if (!response.ok) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `A2A endpoint returned HTTP ${response.status}`);
    return record(await response.json());
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    const kind = error instanceof Error ? error.name : 'Error';
    throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `A2A request failed (${kind})`);
  }
}
function a2aInput(request: ExecutionRequest): JsonRecord {
  if (request.input && typeof request.input === 'object' && !Array.isArray(request.input)) {
    const input = request.input as JsonRecord;
    if (input.message && typeof input.message === 'object') return input;
    if (typeof input.text === 'string') {
      return { message: { kind: 'message', role: 'user', messageId: request.id, parts: [{ kind: 'text', text: input.text }] } };
    }
  }
  const value = typeof request.input === 'string' ? request.input : JSON.stringify(request.input);
  return { message: { kind: 'message', role: 'user', messageId: request.id, parts: [{ kind: 'text', text: value }] } };
}

function extractText(value: unknown): string {
  const root = record(value);
  const parts: unknown[] = [];
  if (Array.isArray(root.parts)) parts.push(...root.parts);
  if (Array.isArray(root.artifacts)) {
    for (const artifactValue of root.artifacts) {
      const artifact = record(artifactValue);
      if (Array.isArray(artifact.parts)) parts.push(...artifact.parts);
    }
  }
  const strings = parts.map(part => record(part)).map(part => text(part.text)).filter((part): part is string => part !== undefined);
  return strings.join('\n');
}

function executionStatus(result: JsonRecord): ExecutionResult['status'] {
  if (result.kind === 'message') return 'succeeded';
  const status = record(result.status ?? {});
  const state = text(status.state);
  if (state === 'completed') return 'succeeded';
  if (state === 'failed' || state === 'rejected' || state === 'canceled' || state === 'cancelled') return 'failed';
  return 'partial';
}
class A2AJsonRpcTransport implements AdapterTransport {
  readonly protocol = 'a2a-jsonrpc';

  async execute(endpoint: AdapterEndpoint, request: ExecutionRequest, context: AdapterTransportContext = {}): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const transport = httpTransport(endpoint);
    const payload = await fetchJson(endpoint, transport.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...resolveAdapterHeaders(transport, context.env ?? process.env) },
      body: JSON.stringify({ jsonrpc: '2.0', id: request.id, method: 'message/send', params: a2aInput(request) })
    }, context);
    if (payload.error) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'A2A endpoint returned a JSON-RPC error');
    const result = record(payload.result);
    const status = executionStatus(result);
    const taskState = result.kind === 'task' ? text(record(result.status ?? {}).state) : undefined;
    const output = { kind: result.kind, text: extractText(result), ...(taskState ? { taskState } : {}), result };
    return {
      contractVersion: CONTRACT_VERSION,
      id: `${request.id}.result`, requestId: request.id, workItemId: request.workItemId,
      status, output,
      ...(status === 'failed' ? { error: { code: 'A2A_TASK_FAILED', message: 'A2A task failed', retryable: false } } : {}),
      startedAt, finishedAt: new Date().toISOString()
    };
  }

  async discover(endpoint: AdapterEndpoint, context: AdapterTransportContext = {}): Promise<readonly CapabilityDescriptor[]> {
    const transport = httpTransport(endpoint);
    const configured = endpoint.metadata?.agentCardUrl;
    const base = new URL(transport.url);
    const cardUrl = typeof configured === 'string' ? configured : `${base.origin}/.well-known/agent-card.json`;
    const card = await fetchJson(endpoint, cardUrl, { method: 'GET', headers: resolveAdapterHeaders(transport, context.env ?? process.env) }, context);
    const skills = Array.isArray(card.skills) ? card.skills : [];
    const checkedAt = new Date().toISOString();    return skills.map((skillValue, index) => {
      const skill = record(skillValue);
      const skillId = safeId(text(skill.id) ?? `skill-${index + 1}`);
      const skillName = text(skill.name) ?? skillId;
      return {
        contractVersion: CONTRACT_VERSION,
        id: `capability.${safeId(endpoint.id)}.${skillId}`,
        name: `${endpoint.name}: ${skillName}`,
        adapterKind: 'a2a' as const,
        operations: ['message/send', `skill:${skillId}`],
        modalities: { input: ['text' as const, 'structured-data' as const], output: ['text' as const, 'structured-data' as const] },
        availability: { state: 'available' as const, checkedAt },
        cost: { class: 'unknown' as const },
        privacy: { executionLocation: transport.url.startsWith('http://127.') || transport.url.startsWith('http://localhost') ? 'local' as const : 'public-cloud' as const },
        trust: { level: 'discovered' as const, source: cardUrl },
        platforms: ['web' as const],
        metadata: { endpointId: endpoint.id, protocolVersion: card.protocolVersion, skill }
      };
    });
  }
}

export function createA2AAdapterTransport(): AdapterTransport {
  return new A2AJsonRpcTransport();
}
