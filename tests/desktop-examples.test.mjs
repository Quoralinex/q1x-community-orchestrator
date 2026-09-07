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
    ajv.addSchema(await json(path.join(schemaDir, `${name}.schema.json`));
  }
  return ajv;
}

async function desktopBatchValidator() {
  const ajv = await validator();
  const validate = ajv.getSchema('urn:q1x:community:contracts:v1:desktop-action-batch');
  assert.ok(validate);
  return { ajv, validate };
}

async function assertBatch(action, options = {}) {
  const { ajv, validate } = await desktopBatchValidator();
  const document = { contractVersion: '1.0.0', id: `desktop.batch.${action.id}`, actions: [action], ...options };
  assert.equal(validate(document), true, ajv.errorsText(validate.errors));
}

test('desktop action schema compiles', async () => {
  await desktopBatchValidator();
});

test('desktop endpoint example validates', async () => {
  const ajv = await validator();
  const validate = ajv.getSchema('urn:q1x:community:contracts:v1:desktop-endpoint');
  const document = await json(path.join(root, 'examples', 'desktop-endpoints', 'portable-stdio.endpoint.json'));
  assert.ok(validate);
  assert.equal(validate(document), true, ajv.errorsText(validate.errors));
});

test('custom desktop backend endpoint does not require stdio transport', async () => {
  const ajv = await validator();
  const validate = ajv.getSchema('urn:q1x:community:contracts:v1:desktop-endpoint');
  assert.ok(validate);
  const document = {
    contractVersion: '1.0.0', id: 'desktop.native', name: 'Native backend', backend: 'native-test',
    platform: 'any', executionLocation: 'local', backendConfig: { channel: 'accessibility' }
  };
  assert.equal(validate(document), true, ajv.errorsText(validate.errors));
});

test('stdio desktop backend endpoint requires transport', async () => {
  const ajv = await validator();
  const validate = ajv.getSchema('urn:q1x:community:contracts:v1:desktop-endpoint');
  assert.ok(validate);
  const document = {
    contractVersion: '1.0.0', id: 'desktop.bad-stdio', name: 'Missing transport', backend: 'stdio-bridge',
    platform: 'any', executionLocation: 'local'
  };
  assert.equal(validate(document), false);
});

test('desktop focus application action validates', async () => {
  await assertBatch({ id: 'focus', kind: 'focus-application', application: 'example.app' });
});

test('desktop inspect action validates', async () => {
  await assertBatch({ id: 'inspect', kind: 'inspect' });
});

test('desktop find action validates', async () => {
  await assertBatch({ id: 'find-submit', kind: 'find', target: { by: 'role', role: 'button', name: 'Continue' } });
});

test('desktop find action without a target is rejected', async () => {
  const { validate } = await desktopBatchValidator();
  const document = { contractVersion: '1.0.0', id: 'desktop.batch.find-missing', actions: [{ id: 'find', kind: 'find' }] };
  assert.equal(validate(document), false);
});

test('desktop batch options validate', async () => {
  await assertBatch({ id: 'list', kind: 'list-applications' }, { stopOnError: true, timeoutMs: 30000 });
});

test('desktop action batch example validates', async () => {
  const { ajv, validate } = await desktopBatchValidator();
  const document = await json(path.join(root, 'examples', 'desktop-endpoints', 'example.desktop-batch.json'));
  assert.equal(validate(document), true, ajv.errorsText(validate.errors));
});
