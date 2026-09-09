import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  loadBuiltInConnectorCatalogue,
  validateConnectorCatalogue,
} from '../packages/runtime/dist/connectors/catalogue.js';

const source = JSON.parse(await readFile(new URL('../connectors/catalogue.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await readFile(new URL('../connectors/schema/connector.schema.json', import.meta.url), 'utf8'));
const implementedIds = [
  'a2a.jsonrpc',
  'browser.chromium.cdp',
  'browser.chromium.managed',
  'cli.json',
  'cli.text',
  'desktop.linux.first-party',
  'desktop.macos.first-party',
  'desktop.windows.first-party',
  'mcp.stdio',
  'mcp.streamable-http',
  'model.anthropic-compatible.hosted',
  'model.anthropic-messages.local',
  'model.openai-chat.local',
  'model.openai-compatible.hosted',
  'model.openai-responses.local',
];

test('connector schema is closed and defines the supported baseline categories/platforms', () => {
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.category.enum, ['model', 'mcp', 'a2a', 'cli', 'browser', 'desktop']);
  assert.deepEqual(schema.properties.platforms.items.enum, ['macos', 'windows', 'linux', 'any']);
  assert.deepEqual(schema.properties.provenance.enum, ['first-party', 'community']);
});

test('built-in connector catalogue validates, is deterministic, and contains only implemented entries', () => {
  const result = validateConnectorCatalogue(source);
  assert.equal(result.ok, true, result.ok ? '' : result.errors.join('; '));
  const catalogue = loadBuiltInConnectorCatalogue();
  assert.deepEqual(catalogue.map(item => item.id), [...catalogue.map(item => item.id)].sort());
  assert.deepEqual(catalogue.map(item => item.id), implementedIds);
  assert.equal(catalogue.every(item => item.provenance === 'first-party'), true);
  assert.deepEqual([...new Set(catalogue.map(item => item.category))].sort(), ['a2a', 'browser', 'cli', 'desktop', 'mcp', 'model']);
});

test('catalogue rejects duplicate ids and compatibility tuples', () => {
  const duplicateId = structuredClone(source);
  duplicateId.connectors.push(structuredClone(duplicateId.connectors[0]));
  assert.equal(validateConnectorCatalogue(duplicateId).ok, false);

  const duplicateTuple = structuredClone(source);
  const copy = structuredClone(duplicateTuple.connectors[0]);
  copy.id = 'a2a.duplicate';
  duplicateTuple.connectors.push(copy);
  assert.equal(validateConnectorCatalogue(duplicateTuple).ok, false);
});

test('catalogue rejects unsupported category/platform/protocol and embedded secret-like properties', () => {
  for (const mutate of [
    value => { value.connectors[0].category = 'database'; },
    value => { value.connectors[0].platforms = ['solaris']; },
    value => { value.connectors[0].protocol = 'Not A Protocol'; },
    value => { value.connectors[0].secretValue = 'should-never-be-stored'; },
  ]) {
    const value = structuredClone(source);
    mutate(value);
    assert.equal(validateConnectorCatalogue(value).ok, false);
  }
});
