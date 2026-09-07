import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(root, "packages", "contracts", "schemas", "v1");
const schemaNames = [
  "common", "mission", "programme", "work-graph", "replan-event", "capability",
  "adapter-manifest", "execution-request", "execution-result", "evidence", "artifact",
  "approval", "checkpoint", "deployment-profile", "discovery-manifest",
  "model-endpoint", "model-request", "model-response", "adapter-endpoint"
];

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const name of schemaNames) {
    ajv.addSchema(await json(path.join(schemaDir, `${name}.schema.json`)));
  }
  return ajv;
}

const examples = [
  ["company-launch/mission.json", "mission"],
  ["company-launch/programme.json", "programme"],
  ["company-launch/work-graph.json", "work-graph"],
  ["digital-r-and-d/mission.json", "mission"],
  ["digital-r-and-d/programme.json", "programme"],
  ["digital-r-and-d/work-graph.json", "work-graph"],
  ["digital-r-and-d/replan-event.json", "replan-event"],
  ["software-delivery/capability.json", "capability"],
  ["software-delivery/adapter-manifest.json", "adapter-manifest"],
  ["software-delivery/execution-request.json", "execution-request"],
  ["software-delivery/execution-result.json", "execution-result"],
  ["software-delivery/evidence.json", "evidence"],
  ["software-delivery/artifact.json", "artifact"],
  ["software-delivery/approval.json", "approval"],
  ["software-delivery/checkpoint.json", "checkpoint"],
  ["software-delivery/deployment-profile.json", "deployment-profile"],
  ["discovery/local-command.discovery.json", "discovery-manifest"],
  ["discovery/local-http.discovery.json", "discovery-manifest"],
  ["discovery/desktop-path.discovery.json", "discovery-manifest"],
  ["model-endpoints/local-openai-chat.endpoint.json", "model-endpoint"],
  ["model-endpoints/local-openai-responses.endpoint.json", "model-endpoint"],
  ["model-endpoints/local-anthropic.endpoint.json", "model-endpoint"],
  ["model-endpoints/hosted-compatible.endpoint.json", "model-endpoint"],
  ["model-endpoints/example.model-request.json", "model-request"],
  ["model-endpoints/example.model-response.json", "model-response"],
  ["adapter-endpoints/mcp-stdio.endpoint.json", "adapter-endpoint"],
  ["adapter-endpoints/a2a-https.endpoint.json", "adapter-endpoint"],
  ["adapter-endpoints/cli-json.endpoint.json", "adapter-endpoint"]
];

test("cross-domain examples validate against normative schemas", async () => {
  const ajv = await validator();
  for (const [relative, schemaName] of examples) {
    const document = await json(path.join(root, "examples", relative));
    const validate = ajv.getSchema(`urn:q1x:community:contracts:v1:${schemaName}`);
    assert.ok(validate, `missing validator for ${schemaName}`);
    assert.equal(validate(document), true, `${relative}: ${ajv.errorsText(validate.errors)}`);
  }
});

test("invalid mission without outcomes is rejected", async () => {
  const ajv = await validator();
  const validate = ajv.getSchema("urn:q1x:community:contracts:v1:mission");
  const bad = { contractVersion: "1.0.0", id: "m-1", title: "Bad", objective: "Bad", status: "active", createdAt: "2026-09-06T00:00:00Z" };
  assert.equal(validate(bad), false);
});

test("unsupported adapter kind is rejected", async () => {
  const ajv = await validator();
  const validate = ajv.getSchema("urn:q1x:community:contracts:v1:capability");
  const base = await json(path.join(root, "examples", "software-delivery", "capability.json"));
  assert.equal(validate({ ...base, adapterKind: "vendor-locked-magic" }), false);
});

test("approved decision without decision record is rejected", async () => {
  const ajv = await validator();
  const validate = ajv.getSchema("urn:q1x:community:contracts:v1:approval");
  const base = await json(path.join(root, "examples", "software-delivery", "approval.json"));
  const { decision, ...withoutDecision } = base;
  assert.equal(validate({ ...withoutDecision, state: "approved" }), false);
});

test("failed execution without error is rejected", async () => {
  const ajv = await validator();
  const validate = ajv.getSchema("urn:q1x:community:contracts:v1:execution-result");
  const base = await json(path.join(root, "examples", "software-delivery", "execution-result.json"));
  const { error, ...withoutError } = base;
  assert.equal(validate({ ...withoutError, status: "failed" }), false);
});
