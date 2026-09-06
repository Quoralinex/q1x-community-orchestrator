import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

async function module() { return import("../packages/runtime/dist/index.js"); }

const request = endpointId => ({
  contractVersion: "1.0.0", id: `request.${endpointId}`, endpointId,
  messages: [
    { role: "system", content: "Be concise" },
    { role: "user", content: "Hello" }
  ], temperature: 0.2, maxOutputTokens: 50, createdAt: "2026-09-06T03:00:00Z"
});

function endpoint(port, protocol, id, credentials = []) {
  return { contractVersion: "1.0.0", id, name: id, adapterKind: "local-inference", protocol,
    url: `http://127.0.0.1:${port}/${protocol}`, defaultModel: "test-model", timeoutMs: 2000,
    credentials, staticHeaders: { "x-protocol-version": "test" } };
}

test("built-in compatible transports map and normalize all three protocols", async t => {
  const seen = [];
  const server = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    seen.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
    res.setHeader("content-type", "application/json");
    if (req.url.includes("openai-chat-completions")) res.end(JSON.stringify({ id: "chat-1", model: "test-model", choices: [{ message: { content: "chat-ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 4 } }));
    else if (req.url.includes("openai-responses")) res.end(JSON.stringify({ id: "resp-1", model: "test-model", output: [{ type: "message", content: [{ type: "output_text", text: "responses-ok" }] }], usage: { input_tokens: 5, output_tokens: 6 } }));
    else res.end(JSON.stringify({ id: "msg-1", model: "test-model", content: [{ type: "text", text: "anthropic-ok" }], stop_reason: "end_turn", usage: { input_tokens: 7, output_tokens: 8 } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const address = server.address(); assert.equal(typeof address, "object"); const port = address.port;
  const { createDefaultModelTransportRegistry } = await module(); const registry = createDefaultModelTransportRegistry();
  const chatEndpoint = endpoint(port, "openai-chat-completions", "endpoint.chat", [{ header: "Authorization", environmentKey: "TEST_MODEL_KEY", prefix: "Bearer " }]);
  const responsesEndpoint = endpoint(port, "openai-responses", "endpoint.responses");
  const messagesEndpoint = endpoint(port, "anthropic-messages", "endpoint.messages", [{ header: "x-api-key", environmentKey: "TEST_MODEL_KEY" }]);
  const context = { env: { TEST_MODEL_KEY: "super-secret" } };
  const chat = await registry.invoke(chatEndpoint, request(chatEndpoint.id), context);
  const responses = await registry.invoke(responsesEndpoint, request(responsesEndpoint.id), context);
  const messages = await registry.invoke(messagesEndpoint, request(messagesEndpoint.id), context);

  assert.equal(chat.outputText, "chat-ok"); assert.deepEqual(chat.usage, { inputTokens: 3, outputTokens: 4 });
  assert.equal(responses.outputText, "responses-ok"); assert.deepEqual(responses.usage, { inputTokens: 5, outputTokens: 6 });
  assert.equal(messages.outputText, "anthropic-ok"); assert.deepEqual(messages.usage, { inputTokens: 7, outputTokens: 8 });
  assert.equal(seen[0].headers.authorization, "Bearer super-secret");
  assert.equal(seen[2].headers["x-api-key"], "super-secret");
  assert.equal(seen[0].body.max_tokens, 50);
  assert.equal(seen[1].body.max_output_tokens, 50);
  assert.equal(seen[2].body.max_tokens, 50);
  assert.equal(seen[2].body.system, "Be concise");
  assert.equal(JSON.stringify([chat, responses, messages]).includes("super-secret"), false);
});

test("non-success transport responses are sanitized", async t => {
  const server = createServer((_req, res) => { res.statusCode = 500; res.end("sensitive-provider-body"); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => server.close());
  const address = server.address(); assert.equal(typeof address, "object");
  const { createDefaultModelTransportRegistry, RuntimeError } = await module();
  const ep = endpoint(address.port, "openai-chat-completions", "endpoint.failure");
  await assert.rejects(() => createDefaultModelTransportRegistry().invoke(ep, request(ep.id)), error => {
    assert.equal(error instanceof RuntimeError, true);
    assert.equal(error.code, "MODEL_TRANSPORT_ERROR");
    assert.equal(error.message.includes("sensitive-provider-body"), false);
    return true;
  });
});