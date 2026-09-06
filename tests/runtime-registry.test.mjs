import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function runtimeModule() {
  return import("../packages/runtime/dist/index.js");
}

const capability = {
  contractVersion: "1.0.0",
  id: "capability.registry-test",
  name: "Registry test capability",
  adapterKind: "cli-tui",
  operations: ["execute"],
  modalities: { input: ["text"], output: ["text"] },
  availability: { state: "available", checkedAt: "2026-09-06T02:00:00Z" },
  cost: { class: "no-usage-fee" },
  privacy: { executionLocation: "local" },
  trust: { level: "discovered" },
  platforms: ["linux", "macos", "windows"]
};
const adapter = {
  contractVersion: "1.0.0",
  id: "adapter.registry-test",
  name: "Registry test adapter",
  version: "1.0.0",
  adapterKind: "cli-tui",
  platforms: ["linux", "macos", "windows"],
  capabilityIds: [capability.id]
};

test("capability and adapter registry persists across restart", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "q1x-registry-"));
  const { OpenControlRuntime } = await runtimeModule();
  let runtime = OpenControlRuntime.open({ home });
  runtime.putCapability(capability);
  runtime.putAdapterManifest(adapter);
  assert.deepEqual(runtime.getCapability(capability.id), capability);
  assert.deepEqual(runtime.getAdapterManifest(adapter.id), adapter);
  runtime.close();

  runtime = OpenControlRuntime.open({ home });
  assert.deepEqual(runtime.listCapabilities(), [capability]);
  assert.deepEqual(runtime.listAdapterManifests(), [adapter]);
  assert.equal(runtime.getStatus().counts.capabilities, 1);
  assert.equal(runtime.getStatus().counts.adapters, 1);
  runtime.close();
  await rm(home, { recursive: true, force: true });
});
test("registry validates capability and adapter contracts", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "q1x-registry-invalid-"));
  const { OpenControlRuntime, RuntimeError } = await runtimeModule();
  const runtime = OpenControlRuntime.open({ home });
  assert.throws(() => runtime.putCapability({ ...capability, operations: [] }), RuntimeError);
  assert.throws(() => runtime.putAdapterManifest({ ...adapter, capabilityIds: ["missing.capability"] }), RuntimeError);
  runtime.close();
  await rm(home, { recursive: true, force: true });
});