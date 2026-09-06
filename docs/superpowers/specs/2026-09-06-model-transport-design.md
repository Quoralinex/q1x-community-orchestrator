# Phase 4 Provider-Neutral Model Transport Design

## Goal

Deliver a secure model-transport layer that can invoke local or hosted inference without making any provider, paid API or model gateway mandatory.

## Core separation

A model endpoint has two independent dimensions:

- `adapterKind` describes how/where the capability is reached (`local-inference`, `openai-protocol`, `anthropic-protocol`, `provider-http`, or a future adapter kind).
- `protocol` identifies the request/response wire contract implemented by a registered transport.

The core ships transports for `openai-chat-completions`, `openai-responses` and `anthropic-messages`. These names describe wire formats only. A local server, proxy, gateway or cloud provider may implement them.

Third-party/native provider integrations register a `ModelTransport` for another protocol id. No vendor switch statement exists in the runtime.## Public contracts

Phase 4 adds three backward-compatible v1 JSON Schema contracts:

1. `ModelEndpoint`: id/name, adapter kind, protocol id, exact endpoint URL, default model, timeout, optional non-secret static headers, and credential-header references by environment-key name.
2. `ModelRequest`: request id, endpoint id, ordered text messages, optional model override, output-token limit and temperature.
3. `ModelResponse`: normalized response id, request/endpoint ids, output text, optional model, token usage, finish reason and timing.

Endpoint credential records contain only `header`, `environmentKey` and optional `prefix`. Secret values are resolved at invocation time from process environment and are never written into SQLite, logs, errors or returned metadata.

Protocol ids are strings rather than a closed enum so externally supplied transports remain possible. The three built-in ids are exported as constants by the reference packages.

## Endpoint persistence

`OpenControlRuntime` stores endpoints in the existing versioned SQLite document store. Methods are `putModelEndpoint`, `getModelEndpoint`, and `listModelEndpoints`. Endpoint documents are safe to persist because they contain references to credentials rather than credentials themselves.## Transport interface

A `ModelTransport` exposes a protocol id and asynchronous `invoke(endpoint, request, context)` method. `ModelTransportRegistry` owns protocol registration and ships the three built-in transports. Duplicate protocol registration is rejected unless a caller explicitly constructs a registry without built-ins.

`OpenControlRuntime.invokeModel(request, context)` validates the request, resolves its stored endpoint, resolves the endpoint protocol in the registry, invokes it, validates the normalized response, and emits audit metadata containing endpoint/protocol/status/duration only. Prompt content and output text are not persisted by default.

An optional runtime method allows an external transport to be registered in memory. This is the extension point for Gemini/native APIs, gateways, experimental protocols or organisation-specific transports without embedding those providers into Community core.

## Built-in request mapping

`openai-chat-completions` sends `model`, `messages`, optional `temperature` and `max_tokens`, then reads the first message text and token usage.

`openai-responses` sends `model`, structured `input`, optional `temperature` and `max_output_tokens`, then reads output text from response message content.

`anthropic-messages` separates system messages from user/assistant messages, sends `model`, `messages`, optional `temperature`, and `max_tokens` (default 1024), then joins text content blocks.## Transport security

Remote endpoints must use HTTPS. Plain HTTP is allowed only for loopback hosts (`localhost`, `127.0.0.0/8`, and `::1`) so local inference remains zero-cost and easy to run without weakening remote transport security.

Requests use bounded timeouts and `redirect: manual`. Static headers may contain protocol metadata but documentation explicitly forbids storing secrets there. Credential headers are injected from environment variables only at invocation time. Missing credential keys fail before network transmission.

Transport errors return stable runtime error codes and sanitized messages; response bodies from failed requests are not echoed because providers may return sensitive content. The runtime does not persist prompts or model output unless a later explicit orchestration feature chooses to create an artifact/evidence record.

## Local-first use

Provider-neutral examples will show loopback endpoints speaking each built-in wire protocol. This covers local inference servers that expose OpenAI- or Anthropic-compatible APIs without requiring a cloud account. Hosted APIs and gateways use the same endpoint contract when they implement a supported protocol.

## CLI

The JSON-first CLI adds `endpoints put/list/get` and `model invoke --file <model-request.json>`. The model request references the stored endpoint by id. Credentials remain supplied by the CLI process environment.## Testing and success criteria

All network tests use loopback servers that emulate protocol response shapes. Tests cover endpoint/request/response schemas, credential resolution without persistence, HTTPS enforcement, each built-in mapping, protocol registry extension, error sanitization, endpoint persistence, CLI round trips and restart safety.

No test calls a real commercial model or needs a provider credential.

Phase 4 is complete when a clean runtime can persist a loopback model endpoint, invoke all three built-in protocol shapes, normalize their output, restart without losing endpoint configuration, register an external in-memory transport, and perform the same operation through the CLI with zero provider cost.