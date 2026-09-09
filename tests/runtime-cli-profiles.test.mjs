import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadCliConnectorProfile,
  materializeCliConnector,
} from '../packages/runtime/dist/connectors/materialize-cli.js';
import { createCliAdapterTransports } from '../packages/runtime/dist/cli-adapter.js';

const configuration = (id, profile, parameters, environmentKeys = {}) => ({
  id,
  enabled: true,
  profile,
  parameters,
  environmentKeys,
  updatedAt: '2026-09-09T00:00:00Z',
});

const definition = (id, profile, protocol) => ({
  id,
  name: id,
  category: 'cli',
  protocol,
  platforms: ['any'],
  requirements: {},
  profile: { kind: profile },
  compatibility: { status: 'experimental', note: 'fixture' },
  provenance: 'first-party',
});

const request = input => ({
  contractVersion: '1.0.0',
  id: 'exec.cli.profile',
  workItemId: 'work.cli.profile',
  requirements: { operations: ['execute'], adapterKinds: ['cli-tui'] },
  input,
  createdAt: '2026-09-09T00:00:00Z',
});

test('CLI profiles are closed and protocol-specific', () => {
  assert.equal(loadCliConnectorProfile('cli-json-stdio').protocol, 'cli-json-stdio');
  assert.equal(loadCliConnectorProfile('cli-text-stdio').protocol, 'cli-text-stdio');
  assert.throws(() => loadCliConnectorProfile('unknown-cli-profile'), /unknown/i);
});

test('CLI JSON profile materializes a direct no-shell endpoint with argv and environment mappings', () => {
  const def = definition('cli.json', 'cli-json-stdio', 'cli-json-stdio');
  const endpoint = materializeCliConnector(def, configuration(
    def.id,
    def.profile.kind,
    { command: process.execPath, args: ['-e', 'console.log("{}")'], timeoutMs: 5000, maxOutputBytes: 65536 },
    { TOKEN: 'HOST_TOKEN' },
  ));
  assert.equal(endpoint.adapterKind, 'cli-tui');
  assert.equal(endpoint.transport.kind, 'stdio');
  assert.equal(endpoint.transport.command, process.execPath);
  assert.deepEqual(endpoint.transport.args, ['-e', 'console.log("{}")']);
  assert.equal(endpoint.transport.inputMode, 'json');
  assert.equal(endpoint.transport.outputMode, 'json');
  assert.deepEqual(endpoint.transport.environment, [{ name: 'TOKEN', environmentKey: 'HOST_TOKEN' }]);
});

test('CLI profile rejects missing command, invalid argv and unsafe cwd shape', () => {
  const def = definition('cli.json', 'cli-json-stdio', 'cli-json-stdio');
  assert.throws(() => materializeCliConnector(def, configuration(def.id, def.profile.kind, {})), /command/i);
  assert.throws(() => materializeCliConnector(def, configuration(def.id, def.profile.kind, { command: 'tool', args: ['ok', 7] })), /args|argv/i);
  assert.throws(() => materializeCliConnector(def, configuration(def.id, def.profile.kind, { command: 'tool', cwd: '' })), /cwd/i);
});

test('materialized CLI JSON profile executes through the existing adapter and preserves environment allowlisting', async () => {
  const def = definition('cli.json', 'cli-json-stdio', 'cli-json-stdio');
  const script = "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.stringify({input:JSON.parse(s),mapped:process.env.MAPPED,leaked:process.env.UNRELATED||null})))";
  const endpoint = materializeCliConnector(def, configuration(
    def.id,
    def.profile.kind,
    { command: process.execPath, args: ['-e', script] },
    { MAPPED: 'SOURCE_VALUE' },
  ));
  const transport = createCliAdapterTransports().find(item => item.protocol === endpoint.protocol);
  assert.ok(transport);
  const result = await transport.execute(endpoint, request({ value: 42 }), {
    env: { PATH: process.env.PATH, SOURCE_VALUE: 'allowed', UNRELATED: 'must-not-leak' },
  });
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.output, { input: { value: 42 }, mapped: 'allowed', leaked: null });
});

test('materialized CLI text profile executes text stdin/stdout without shell interpolation', async () => {
  const def = definition('cli.text', 'cli-text-stdio', 'cli-text-stdio');
  const script = "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write('seen:'+s))";
  const endpoint = materializeCliConnector(def, configuration(def.id, def.profile.kind, {
    command: process.execPath,
    args: ['-e', script],
  }));
  const transport = createCliAdapterTransports().find(item => item.protocol === endpoint.protocol);
  assert.ok(transport);
  const result = await transport.execute(endpoint, request('hello; echo not-a-shell'));
  assert.equal(result.status, 'succeeded');
  assert.equal(result.output, 'seen:hello; echo not-a-shell');
});
