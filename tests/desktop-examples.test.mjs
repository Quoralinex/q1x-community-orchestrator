import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = path.join(root, 'packages', 'contracts', 'schemas', 'v1');

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const name of ['common', 'desktop-endpoint', 'desktop-action-batch']) {
    ajv.addSchema(await json(path.join(schemaDir, `${name}.schema.json`)));
  }
  return ajv;
}

test('desktop endpoint example validates', async () => {
  const ajv = await validator();
  const validate = ajv.getSchema('urn:q1x:community:contracts:v1:desktop-endpoint');
  const document = await json(path.join(root, 'examples', 'desktop-endpoints', 'portable-stdio.endpoint.json'));
  assert.ok(validate);
  assert.equal(validate(document), true, ajv.errorsText(validate.errors));
});

test('desktop action batch example validates', async () => {
  const ajv = await validator();
  const validate = ajv.getSchema('urn:q1x:community:contracts:v1:desktop-action-batch');
  const document = await json(path.join(root, 'examples', 'desktop-endpoints', 'example.desktop-batch.json'));
  assert.ok(validate);
  assert.equal(validate(document), true, ajv.errorsText(validate.errors));
});
