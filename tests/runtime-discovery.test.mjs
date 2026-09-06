import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function discoveryModule() {
  return import("../packages/runtime/dist/discovery.js");
}

function template() {
  return {
    id: "capability.synthetic-cli",
    name: "Synthetic CLI",
    adapterKind: "cli-tui",
    operations: ["execute"],
    modalities: { input: ["text"], output: ["text"] },
    cost: { class: "no-usage-fee" },
    privacy: { executionLocation: "local" },
    trust: { level: "unverified" },
    platforms: ["linux", "macos", "windows"]
  };
}
test("command, path and environment probes are generic and secret-safe", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "q1x-discovery-"));
  const bin = path.join(root, "bin");
  const home = path.join(root, "home");
  await mkdir(bin); await mkdir(home);
  const executable = path.join(bin, "synthetic-tool");
  await writeFile(executable, "#!/bin/sh\nexit 0\n");
  await chmod(executable, 0o755);
  const marker = path.join(home, "marker.txt");
  await writeFile(marker, "present");

  const { discoverManifest } = await discoveryModule();
  const secret = "do-not-leak-this-value";
  const manifest = {
    contractVersion: "1.0.0", id: "discovery.synthetic", name: "Synthetic discovery", version: "1.0.0",
    platforms: ["macos", "linux"], activation: "all",
    probes: [
      { kind: "command", names: ["synthetic-tool"] },
      { kind: "path", paths: ["~/marker.txt"] },
      { kind: "environment", keys: ["SYNTHETIC_TOKEN"] }
    ], capability: template()
  };
  const result = await discoverManifest(manifest, { platform: "macos", home, env: { PATH: bin, SYNTHETIC_TOKEN: secret } });
  assert.equal(result.capability.availability.state, "available");
  assert.equal(result.capability.trust.level, "discovered");
  assert.equal(result.probes.every(p => p.success), true);
  assert.equal(JSON.stringify(result).includes(secret), false);
  await rm(root, { recursive: true, force: true });
});
test("activation modes and platform skipping derive availability deterministically", async () => {
  const { discoverManifest } = await discoveryModule();
  const base = { contractVersion: "1.0.0", id: "discovery.activation", name: "Activation", version: "1", platforms: ["macos"], capability: template() };

  const anyResult = await discoverManifest({ ...base, activation: "any", probes: [
    { kind: "environment", keys: ["MISSING_KEY"] },
    { kind: "environment", keys: ["PRESENT_KEY"] }
  ]}, { platform: "macos", env: { PRESENT_KEY: "yes" }, home: "/tmp" });
  assert.equal(anyResult.capability.availability.state, "available");

  const allResult = await discoverManifest({ ...base, id: "discovery.all", activation: "all", probes: [
    { kind: "environment", keys: ["PRESENT_KEY"] },
    { kind: "environment", keys: ["MISSING_KEY"] }
  ]}, { platform: "macos", env: { PRESENT_KEY: "yes" }, home: "/tmp" });
  assert.equal(allResult.capability.availability.state, "offline");

  const skipped = await discoverManifest({ ...base, id: "discovery.skipped", activation: "all", probes: [
    { kind: "environment", keys: ["PRESENT_KEY"], platforms: ["windows"] }
  ]}, { platform: "macos", env: { PRESENT_KEY: "yes" }, home: "/tmp" });
  assert.equal(skipped.capability.availability.state, "unknown");
  assert.equal(skipped.probes[0].applicable, false);
});