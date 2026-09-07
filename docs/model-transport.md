# Provider-Neutral Model Transport

Phase 4 adds a model-transport layer without making any model vendor, hosted API, gateway or paid service mandatory.

## Protocol is not provider

Q1X separates **where a model runs** from **which wire protocol it speaks**. A model can be local, self-hosted or cloud-hosted while using the same protocol adapter. The built-in protocol ids are:

- `openai-chat-completions`
- `openai-responses`
- `anthropic-messages`

Those names describe compatible HTTP message formats. They do not require OpenAI or Anthropic accounts. Additional native or provider-specific protocols can be registered through the public `ModelTransport` interface without modifying the core router.

## Local-first endpoints

Loopback HTTP is permitted so local inference servers can run without TLS. Remote plain HTTP is rejected.

```bash
node packages/runtime/dist/cli.js --home .q1x endpoints put \
  --file examples/model-endpoints/local-openai-chat.endpoint.json

node packages/runtime/dist/cli.js --home .q1x endpoints list
```

Then invoke a normalized request:

```bash
node packages/runtime/dist/cli.js --home .q1x model invoke \
  --file examples/model-endpoints/example.model-request.json
```

The endpoint must correspond to a compatible server that is actually running. Q1X does not require, install or start a particular model server.

## Hosted endpoints and credentials

Remote endpoints must use HTTPS. Credential values are never persisted in endpoint JSON. An endpoint stores only the header name and environment-variable key:

```json
{
  "header": "Authorization",
  "environmentKey": "Q1X_MODEL_API_KEY",
  "prefix": "Bearer "
}
```

The secret value is resolved by the running process immediately before transmission. Static `Authorization`, API-key and similar secret-bearing headers are rejected from persisted endpoint configuration.

## Privacy and audit

Model prompts and model outputs are not written to the control-runtime document store or invocation audit events. Invocation audit records contain only non-content metadata such as endpoint, protocol, outcome, duration and error code.

## Extending transports

A third-party adapter can register any protocol id through `ModelTransportRegistry`. That is the extension point for native Gemini-style APIs, gateways, organisation-specific protocols and future transports. The Community core does not contain a provider switch statement.

## Examples

`examples/model-endpoints/` contains schema-validated examples for all three built-in protocols, a hosted credential-reference endpoint, and normalized request/response documents.
