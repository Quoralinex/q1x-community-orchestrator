import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { ADAPTER_KINDS, SCHEMA_IDS } from "../packages/contracts/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(root, "packages", "contracts", "schemas", "v1");

async function load(name) {
  return JSON.parse(await readFile(path.join(schemaDir, name), "utf8"));
}

test("TypeScript adapter catalog matches the normative schema enum", async () => {
  const common = await load("common.schema.json");
  assert.deepEqual([...ADAPTER_KINDS], common.$defs.adapterKind.enum);
});

test("TypeScript schema catalog covers every normative Phase 1 schema", async () => {
  const files = [
    "common", "mission", "programme", "work-graph", "replan-event", "capability",
    "adapter-manifest", "execution-request", "execution-result", "evidence", "artifact",
    "approval", "checkpoint", "deployment-profile", "discovery-manifest"
  ];
  const schemaIds = [];
  for (const name of files) schemaIds.push((await load(`${name}.schema.json`)).$id);
  assert.deepEqual(new Set(Object.values(SCHEMA_IDS)), new Set(schemaIds));
});

test("workspace packages carry the repository licence", async () => {
  const rootLicense = await readFile(path.join(root, "LICENSE"), "utf8");
  for (const workspace of ["contracts", "sdk-typescript"]) {
    const packageLicense = await readFile(path.join(root, "packages", workspace, "LICENSE"), "utf8");
    assert.equal(packageLicense, rootLicense, `${workspace} licence must match repository LICENSE`);
  }
});

test("runtime package is distributable and licensed", async () => {
  const rootLicense = await readFile(path.join(root, "LICENSE"), "utf8");
  const runtimeDir = path.join(root, "packages", "runtime");
  const packageJson = JSON.parse(await readFile(path.join(runtimeDir, "package.json"), "utf8"));
  const runtimeLicense = await readFile(path.join(runtimeDir, "LICENSE"), "utf8");
  const runtimeReadme = await readFile(path.join(runtimeDir, "README.md"), "utf8");
  assert.equal(runtimeLicense, rootLicense);
  assert.equal(packageJson.name, "@quoralinex/q1x-community-runtime");
  assert.equal(packageJson.engines.node, ">=24");
  assert.equal(packageJson.bin.q1x, "./dist/cli.js");
  assert.match(runtimeReadme, /Open Control Runtime/i);
});
