import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function modules() {
  const runtime = await import("../packages/runtime/dist/index.js");
  return runtime;
}

function manifest(url, id = "http") {
  return {
    contractVersion: "1.0.0", id: `discovery.${id}`, name: "Loopback service", version: "1.0.0",
    platforms: ["any"], activation: "any", probes: [{ kind: "http", url, timeoutMs: 2000 }],
    capability: {
      id: `capability.${id}`, name: "Loopback service", adapterKind: "provider-http",
      operations: ["request"], modalities: { input: ["text"], output: ["text"] },
      cost: { class: "no-usage-fee" }, privacy: { executionLocation: "local" },
      trust: { level: "unverified" }, platforms: ["any"]
    }
  };
}
test("runtime discovers HTTP capability and persists it across restart", async (t) => {
  const server = createServer((_req, res) => { res.statusCode = 204; res.end(); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.equal(typeof address, "object");
  const url = `http://127.0.0.1:${address.port}/health`;
  const home = await mkdtemp(path.join(tmpdir(), "q1x-http-discovery-"));
  const { OpenControlRuntime } = await modules();
  let runtime = OpenControlRuntime.open({ home });
  const result = await runtime.discover(manifest(url));
  assert.equal(result.capability.availability.state, "available");
  assert.equal(runtime.getCapability("capability.http").availability.state, "available");
  runtime.close();
  runtime = OpenControlRuntime.open({ home });
  assert.equal(runtime.getCapability("capability.http").availability.state, "available");
  runtime.close();
  await rm(home, { recursive: true, force: true });
});

test("HTTP probe failures are isolated and do not expose secrets", async () => {
  const { discoverManifest } = await modules();
  const secret = "secret-query-value";
  const value = manifest(`http://127.0.0.1:1/health?token=${secret}`, "offline");
  value.probes.push({ kind: "environment", keys: ["FALLBACK_OK"] });
  const result = await discoverManifest(value, { env: { FALLBACK_OK: "yes" }, platform: "linux" });
  assert.equal(result.capability.availability.state, "available");
  assert.equal(result.probes[0].success, false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});