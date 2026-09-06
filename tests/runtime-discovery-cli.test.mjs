import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const cli = join(root, "packages/runtime/dist/cli.js");

function capability(id) {
  return { id, name: id, adapterKind: "desktop-control", operations: ["operate"],
    modalities: { input: ["text"], output: ["text"] }, cost: { class: "no-usage-fee" },
    privacy: { executionLocation: "local" }, trust: { level: "unverified" }, platforms: ["any"] };
}

function manifest(id, marker) {
  return { contractVersion: "1.0.0", id: `discovery.${id}`, name: id, version: "1", platforms: ["any"],
    activation: "any", probes: [{ kind: "path", paths: [marker] }], capability: capability(`capability.${id}`) };
}

function run(home, ...args) {
  return spawnSync(process.execPath, [cli, "--home", home, ...args], { encoding: "utf8" });
}

test("manifest loader reads a file and sorted discovery directory", async t => {
  const temp = await mkdtemp(join(tmpdir(), "q1x-loader-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const marker = join(temp, "marker"); await writeFile(marker, "ok");
  const dir = join(temp, "pack"); await mkdir(dir);
  await writeFile(join(dir, "b.discovery.json"), JSON.stringify(manifest("b", marker)));
  await writeFile(join(dir, "a.discovery.json"), JSON.stringify(manifest("a", marker)));
  await writeFile(join(dir, "ignore.json"), "{}");
  const { loadDiscoveryManifests } = await import("../packages/runtime/dist/discovery-loader.js");
  assert.deepEqual((await loadDiscoveryManifests(dir)).map(item => item.id), ["discovery.a", "discovery.b"]);
  assert.equal((await loadDiscoveryManifests(join(dir, "a.discovery.json")))[0].id, "discovery.a");
});

test("q1x discover populates live registry across CLI invocations", async t => {
  const temp = await mkdtemp(join(tmpdir(), "q1x-discovery-cli-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const home = join(temp, "home"); const marker = join(temp, "desktop.marker");
  await writeFile(marker, "present");
  const file = join(temp, "desktop.discovery.json");
  await writeFile(file, JSON.stringify(manifest("desktop", marker)));
  const discovered = run(home, "discover", "--manifest", file);
  assert.equal(discovered.status, 0, discovered.stderr);
  assert.equal(JSON.parse(discovered.stdout)[0].capability.availability.state, "available");
  const list = run(home, "capabilities", "list");
  assert.equal(list.status, 0, list.stderr);
  assert.equal(JSON.parse(list.stdout)[0].id, "capability.desktop");
  const get = run(home, "capabilities", "get", "capability.desktop");
  assert.equal(JSON.parse(get.stdout).id, "capability.desktop");
  const adapters = run(home, "adapters", "list");
  assert.deepEqual(JSON.parse(adapters.stdout), []);
});