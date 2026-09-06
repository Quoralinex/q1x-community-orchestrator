import assert from "node:assert/strict";
import test from "node:test";

async function module() { return import("../packages/runtime/dist/index.js"); }

const endpoint = {
  contractVersion: "1.0.0", id: "endpoint.external", name: "External", adapterKind: "provider-http",
  protocol: "example-native-protocol", url: "https://example.invalid/model", defaultModel: "example-model"
};
const request = {
  contractVersion: "1.0.0", id: "model.request.external", endpointId: endpoint.id,
  messages: [{ role: "user", content: "hello" }], createdAt: "2026-09-06T03:00:00Z"
};

test("external model transport registers and normalizes invocation", async () => {
  const { ModelTransportRegistry } = await module();
  const transport = { protocol: "example-native-protocol", async invoke(_endpoint, value) {
    return { contractVersion: "1.0.0", id: "response.external", requestId: value.id, endpointId: value.endpointId,
      outputText: "external-ok", startedAt: value.createdAt, finishedAt: value.createdAt };
  }};
  const registry = new ModelTransportRegistry();
  registry.register(transport);
  assert.equal(registry.get(transport.protocol), transport);
  assert.equal((await registry.invoke(endpoint, request)).outputText, "external-ok");
});
test("transport registry rejects duplicate and unknown protocols", async () => {
  const { ModelTransportRegistry, RuntimeError } = await module();
  const transport = { protocol: "duplicate", async invoke() { throw new Error("not called"); } };
  const registry = new ModelTransportRegistry([transport]);
  assert.throws(() => registry.register(transport), RuntimeError);
  await assert.rejects(() => registry.invoke({ ...endpoint, protocol: "missing" }, request), RuntimeError);
  assert.deepEqual(registry.protocols(), ["duplicate"]);
});