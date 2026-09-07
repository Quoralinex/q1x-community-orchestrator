import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type {
  AdapterEndpoint, CapabilityDescriptor, ExecutionRequest, ExecutionResult
} from '@quoralinex/q1x-community-sdk';
import { assertSafeAdapterEndpoint, resolveAdapterEnvironment, resolveAdapterHeaders } from './adapter-security.js';
import type { AdapterTransport, AdapterTransportContext } from './adapter-transport.js';
import { RuntimeError } from './errors.js';

const CLIENT_INFO = { name: 'q1x-community-orchestrator', version: '0.1.0-alpha.1' };
const MCP_STDIO_PROTOCOL = 'mcp-stdio-v2';
const MCP_HTTP_PROTOCOL = 'mcp-streamable-http-v2';

function identifierPart(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+/, '');
  return (clean || 'tool').slice(0, 96);
}

function timeoutMs(endpoint: AdapterEndpoint): number {
  return endpoint.transport.timeoutMs ?? 60_000;
}
function capabilityForTool(endpoint: AdapterEndpoint, tool: { name: string; description?: string }): CapabilityDescriptor {
  const local = endpoint.transport.kind === 'stdio' || new URL(endpoint.transport.url).hostname === 'localhost' || new URL(endpoint.transport.url).hostname.startsWith('127.');
  return {
    contractVersion: '1.0.0',
    id: `${identifierPart(endpoint.id)}:${identifierPart(tool.name)}`,
    name: tool.description ? `${tool.name} — ${tool.description}` : tool.name,
    adapterKind: 'mcp',
    operations: [`mcp-tool:${tool.name}`],
    modalities: { input: ['structured-data'], output: ['structured-data'] },
    availability: { state: 'available', checkedAt: new Date().toISOString() },
    cost: { class: local ? 'no-usage-fee' : 'unknown' },
    privacy: { executionLocation: local ? 'local' : 'managed-cloud', dataRetention: 'unknown' },
    trust: { level: 'discovered', source: endpoint.id },
    platforms: endpoint.transport.kind === 'stdio' ? ['any'] : ['web'],
    metadata: { endpointId: endpoint.id, toolName: tool.name }
  };
}

function failure(request: ExecutionRequest, startedAt: string, error: unknown): ExecutionResult {
  return {
    contractVersion: '1.0.0', id: `${request.id}:result`, requestId: request.id, workItemId: request.workItemId,
    status: 'failed', startedAt, finishedAt: new Date().toISOString(),
    error: { code: 'MCP_TRANSPORT_ERROR', message: error instanceof Error ? error.name : 'MCP transport failed', retryable: true }
  };
}
function stdioEnvironment(endpoint: AdapterEndpoint, env: NodeJS.ProcessEnv): Record<string, string> {
  if (endpoint.transport.kind !== 'stdio') throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'MCP stdio requires a stdio endpoint');
  return Object.fromEntries(
    Object.entries(resolveAdapterEnvironment(endpoint.transport, env)).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

async function connectClient(endpoint: AdapterEndpoint, context: AdapterTransportContext): Promise<Client> {
  assertSafeAdapterEndpoint(endpoint);
  const client = new Client(CLIENT_INFO);
  if (endpoint.transport.kind === 'stdio') {
    const transport = new StdioClientTransport({
      command: endpoint.transport.command,
      args: endpoint.transport.args,
      cwd: endpoint.transport.cwd,
      env: stdioEnvironment(endpoint, context.env ?? process.env),
      stderr: 'pipe',
      maxBufferSize: endpoint.transport.maxOutputBytes
    });
    await client.connect(transport, { signal: context.signal });
    return client;
  }
  const headers = resolveAdapterHeaders(endpoint.transport, context.env ?? process.env);
  const transport = new StreamableHTTPClientTransport(new URL(endpoint.transport.url), {
    requestInit: { headers }, fetch: context.fetch ?? globalThis.fetch
  });
  await client.connect(transport, { signal: context.signal });
  return client;
}
class McpAdapterTransport implements AdapterTransport {
  constructor(readonly protocol: string) {}

  async discover(endpoint: AdapterEndpoint, context: AdapterTransportContext = {}): Promise<readonly CapabilityDescriptor[]> {
    const client = await connectClient(endpoint, context);
    try {
      const listed = await client.listTools(undefined, { timeout: timeoutMs(endpoint), signal: context.signal });
      return listed.tools.map(tool => capabilityForTool(endpoint, tool));
    } finally {
      await client.close();
    }
  }

  async execute(endpoint: AdapterEndpoint, request: ExecutionRequest, context: AdapterTransportContext = {}): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    try {
      const input = request.input as { tool?: unknown; arguments?: unknown };
      if (!input || typeof input !== 'object' || typeof input.tool !== 'string') {
        throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'MCP execution input requires a tool name');
      }
      const args = input.arguments === undefined ? undefined : input.arguments;
      if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
        throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'MCP tool arguments must be an object');
      }
      const client = await connectClient(endpoint, context);
      try {
        const result = await client.callTool({ name: input.tool, arguments: args as Record<string, unknown> | undefined }, {
          timeout: timeoutMs(endpoint), signal: context.signal
        });
        const output = { content: result.content, structuredContent: result.structuredContent, meta: result._meta };
        return result.isError ? {
          contractVersion: '1.0.0', id: `${request.id}:result`, requestId: request.id, workItemId: request.workItemId,
          status: 'failed', output, startedAt, finishedAt: new Date().toISOString(),
          error: { code: 'MCP_TOOL_ERROR', message: 'MCP tool reported an error', retryable: false }
        } : {
          contractVersion: '1.0.0', id: `${request.id}:result`, requestId: request.id, workItemId: request.workItemId,
          status: 'succeeded', output, startedAt, finishedAt: new Date().toISOString()
        };
      } finally {
        await client.close();
      }
    } catch (error) { return failure(request, startedAt, error); }
  }
}
export function createMcpAdapterTransports(): AdapterTransport[] {
  return [new McpAdapterTransport(MCP_STDIO_PROTOCOL), new McpAdapterTransport(MCP_HTTP_PROTOCOL)];
}
