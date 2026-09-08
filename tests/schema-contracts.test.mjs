import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(root, "packages", "contracts", "schemas", "v1");
const required = [
  "common.schema.json", "mission.schema.json", "programme.schema.json",
  "work-graph.schema.json", "replan-event.schema.json", "capability.schema.json",
  "adapter-manifest.schema.json", "execution-request.schema.json",
  "execution-result.schema.json", "evidence.schema.json", "artifact.schema.json",
  "approval.schema.json", "checkpoint.schema.json", "audit-receipt.schema.json", "deployment-profile.schema.json",
  "discovery-manifest.schema.json", "model-endpoint.schema.json",
  "model-request.schema.json", "model-response.schema.json", "adapter-endpoint.schema.json",
  "browser-endpoint.schema.json", "browser-action-batch.schema.json",
  "desktop-endpoint.schema.json", "desktop-action-batch.schema.json",
  "execution-binding.schema.json", "team-plan.schema.json", "work-assignment.schema.json",
  "programme-proposal.schema.json", "supervision-policy.schema.json", "supervision-cycle.schema.json"
];

async function load(name) {
  return JSON.parse(await readFile(path.join(schemaDir, name), "utf8"));
}

test("all normative schemas exist and self-validate", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const name of required) {
    const schema = await load(name);
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.match(schema.$id, /^urn:q1x:community:contracts:v1:/);
    assert.equal(ajv.validateSchema(schema), true, `${name}: ${ajv.errorsText()}`);
  }
});
