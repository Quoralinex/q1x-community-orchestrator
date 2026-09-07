import { CONTRACT_VERSION } from '@quoralinex/q1x-community-contracts';
import type { ModelEndpoint, ModelRequest, ModelResponse } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';
import { resolveEndpointHeaders } from './model-security.js';
import type { ModelTransport, ModelTransportContext } from './model-transport.js';
import { ModelTransportRegistry } from './model-transport.js';

interface JsonRecord { [key: string]: unknown; }

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RuntimeError('MODEL_TRANSPORT_ERROR', 'Model transport returned invalid JSON');
  }
  return value as JsonRecord;
}

function optionalRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function normalizedUsage(inputTokens: unknown, outputTokens: unknown): ModelResponse['usage'] | undefined {
  const input = tokenCount(inputTokens);
  const output = tokenCount(outputTokens);
  if (input === undefined && output === undefined) return undefined;
  return {
    ...(input !== undefined ? { inputTokens: input } : {}),
    ...(output !== undefined ? { outputTokens: output } : {}),
  };
}

function baseResponse(endpoint: ModelEndpoint, request: ModelRequest, startedAt: string): Omit<ModelResponse, 'outputText'> {
  return {
    contractVersion: CONTRACT_VERSION,
    id: request.id,
    requestId: request.id,
    endpointId: endpoint.id,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

function optionalResponseFields(
  payload: JsonRecord,
  usage: ModelResponse['usage'] | undefined,
  finishReason: string | undefined,
): Pick<ModelResponse, 'model' | 'usage' | 'finishReason'> {
  return {
    ...(text(payload.model) ? { model: text(payload.model) } : {}),
    ...(usage ? { usage } : {}),
    ...(finishReason ? { finishReason } : {}),
  };
}

async function postJson(endpoint: ModelEndpoint, body: unknown, context: ModelTransportContext): Promise<JsonRecord> {
  const fetchImpl = context.fetch ?? globalThis.fetch;
  const headers = {
    'content-type': 'application/json',
    ...resolveEndpointHeaders(endpoint, context.env ?? process.env),
  };
  try {
    const response = await fetchImpl(endpoint.url, {
      method: 'POST',
      headers,
      redirect: 'manual',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(endpoint.timeoutMs ?? 30000),
    });
    if (!response.ok) {
      throw new RuntimeError(
        'MODEL_TRANSPORT_ERROR',
        `Model transport ${endpoint.protocol} returned HTTP ${response.status}`,
        { status: response.status },
      );
    }
    return asRecord(await response.json());
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    const kind = error instanceof Error ? error.name : 'Error';
    throw new RuntimeError('MODEL_TRANSPORT_ERROR', `Model transport ${endpoint.protocol} failed (${kind})`);
  }
}

class OpenAIChatCompletionsTransport implements ModelTransport {
  readonly protocol = 'openai-chat-completions';

  async invoke(endpoint: ModelEndpoint, request: ModelRequest, context: ModelTransportContext = {}): Promise<ModelResponse> {
    const startedAt = new Date().toISOString();
    const body: JsonRecord = {
      model: request.model ?? endpoint.defaultModel,
      messages: request.messages,
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens;
    const payload = await postJson(endpoint, body, context);
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = asRecord(choices[0]);
    const message = asRecord(first.message);
    const outputText = text(message.content);
    if (outputText === undefined) {
      throw new RuntimeError('MODEL_TRANSPORT_ERROR', 'Chat-completions response did not contain text output');
    }
    const rawUsage = optionalRecord(payload.usage);
    return {
      ...baseResponse(endpoint, request, startedAt),
      outputText,
      ...optionalResponseFields(
        payload,
        normalizedUsage(rawUsage.prompt_tokens, rawUsage.completion_tokens),
        text(first.finish_reason),
      ),
    };
  }
}

function responsesOutputText(payload: JsonRecord): string | undefined {
  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];
  for (const itemValue of output) {
    const item = optionalRecord(itemValue);
    const content = Array.isArray(item.content) ? item.content : [];
    for (const partValue of content) {
      const value = text(optionalRecord(partValue).text);
      if (value !== undefined) parts.push(value);
    }
  }
  return parts.length ? parts.join('') : text(payload.output_text);
}

class OpenAIResponsesTransport implements ModelTransport {
  readonly protocol = 'openai-responses';

  async invoke(endpoint: ModelEndpoint, request: ModelRequest, context: ModelTransportContext = {}): Promise<ModelResponse> {
    const startedAt = new Date().toISOString();
    const body: JsonRecord = {
      model: request.model ?? endpoint.defaultModel,
      input: request.messages.map(message => ({ role: message.role, content: message.content })),
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxOutputTokens !== undefined) body.max_output_tokens = request.maxOutputTokens;
    const payload = await postJson(endpoint, body, context);
    const outputText = responsesOutputText(payload);
    if (outputText === undefined) {
      throw new RuntimeError('MODEL_TRANSPORT_ERROR', 'Responses transport did not contain text output');
    }
    const rawUsage = optionalRecord(payload.usage);
    return {
      ...baseResponse(endpoint, request, startedAt),
      outputText,
      ...optionalResponseFields(
        payload,
        normalizedUsage(rawUsage.input_tokens, rawUsage.output_tokens),
        text(payload.status),
      ),
    };
  }
}

class AnthropicMessagesTransport implements ModelTransport {
  readonly protocol = 'anthropic-messages';

  async invoke(endpoint: ModelEndpoint, request: ModelRequest, context: ModelTransportContext = {}): Promise<ModelResponse> {
    const startedAt = new Date().toISOString();
    const system = request.messages
      .filter(message => message.role === 'system')
      .map(message => message.content)
      .join('\n\n');
    const messages = request.messages
      .filter(message => message.role !== 'system')
      .map(message => ({ role: message.role, content: message.content }));
    const body: JsonRecord = {
      model: request.model ?? endpoint.defaultModel,
      messages,
      max_tokens: request.maxOutputTokens ?? 1024,
    };
    if (system) body.system = system;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    const payload = await postJson(endpoint, body, context);
    const content = Array.isArray(payload.content) ? payload.content : [];
    const parts = content
      .map(value => optionalRecord(value))
      .map(part => text(part.text))
      .filter((value): value is string => value !== undefined);
    if (!parts.length) {
      throw new RuntimeError('MODEL_TRANSPORT_ERROR', 'Anthropic-compatible response did not contain text output');
    }
    const rawUsage = optionalRecord(payload.usage);
    return {
      ...baseResponse(endpoint, request, startedAt),
      outputText: parts.join(''),
      ...optionalResponseFields(
        payload,
        normalizedUsage(rawUsage.input_tokens, rawUsage.output_tokens),
        text(payload.stop_reason),
      ),
    };
  }
}

export function createDefaultModelTransportRegistry(): ModelTransportRegistry {
  return new ModelTransportRegistry([
    new OpenAIChatCompletionsTransport(),
    new OpenAIResponsesTransport(),
    new AnthropicMessagesTransport(),
  ]);
}
