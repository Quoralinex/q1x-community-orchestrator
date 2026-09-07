import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function runtimeModule() { return import("../packages/runtime/dist/index.js"); }

function endpoint(overrides = {}) {
  return {
    contractVersion: "1.0.0", id: "endpoint.local", name: "Local model endpoint",
    adapterKind: "local-inference", protocol: "openai-chat-completions",
    url: "http://127.0.0.1:1234/v1/chat/completions", defaultModel: "local-model",
    ...overrides
  };
}

test("model endpoints persist across restart", async t => {
  const home = await mkdtemp(path.join(tmpdir(), "q1x-endpoint-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime } = await runtimeModule();
  let runtime = OpenControlRuntime.open({ home });
  runtime.putModelEndpoint(endpoint());
  runtime.close();
  runtime = OpenControlRuntime.open({ home });
  assert.deepEqual(runtime.getModelEndpoint("endpoint.local"), endpoint());
  assert.deepEqual(runtime.listModelEndpoints(), [endpoint()]);
  runtime.close();
});
test("transport security allows loopback HTTP and rejects remote insecure endpoints", async t => {
  const home = await mkdtemp(path.join(tmpdir(), "q1x-endpoint-security-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime, RuntimeError } = await runtimeModule();
  const runtime = OpenControlRuntime.open({ home });
  assert.doesNotThrow(() => runtime.putModelEndpoint(endpoint()));
  assert.throws(() => runtime.putModelEndpoint(endpoint({ id: "endpoint.remote", url: "http://example.com/v1/chat/completions" })), RuntimeError);
  assert.doesNotThrow(() => runtime.putModelEndpoint(endpoint({ id: "endpoint.secure", url: "https://example.com/v1/chat/completions" })));
  assert.throws(() => runtime.putModelEndpoint(endpoint({ id: "endpoint.secret-static", staticHeaders: { Authorization: "Bearer secret" } })), RuntimeError);
  runtime.close();
});

test("credential headers resolve from environment without mutating persisted endpoint", async t => {
  const home = await mkdtemp(path.join(tmpdir(), "q1x-endpoint-credential-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { OpenControlRuntime, resolveEndpointHeaders, RuntimeError } = await runtimeModule();
  const value = endpoint({ credentials: [{ header: "Authorization", environmentKey: "MODEL_TEST_KEY", prefix: "Bearer " }], staticHeaders: { "x-protocol-version": "1" } });
  const runtime = OpenControlRuntime.open({ home }); runtime.putModelEndpoint(value);
  const headers = resolveEndpointHeaders(value, { MODEL_TEST_KEY: "super-secret" });
  assert.equal(headers.Authorization, "Bearer super-secret");
  assert.equal(headers["x-protocol-version"], "1");
  assert.equal(JSON.stringify(runtime.getModelEndpoint(value.id)).includes("super-secret"), false);
  assert.throws(() => resolveEndpointHeaders(value, {}), RuntimeError);
  runtime.close();
});