import assert from 'node:assert/strict';
import test from 'node:test';

async function module() { return import('../packages/runtime/dist/index.js'); }

const request = input => ({
  contractVersion: '1.0.0', id: 'exec.cli.1', workItemId: 'work.cli.1',
  requirements: { operations: ['execute'] }, input, createdAt: '2026-09-07T08:00:00Z'
});

function endpoint(script, overrides = {}) {
  return {
    contractVersion: '1.0.0', id: 'adapter.cli.node', name: 'Portable Node CLI',
    adapterKind: 'cli-tui', protocol: 'cli-json-stdio',
    transport: { kind: 'stdio', command: process.execPath, args: ['-e', script], inputMode: 'json', outputMode: 'json', timeoutMs: 2000, maxOutputBytes: 65536 },
    ...overrides
  };
}

test('CLI JSON adapter executes without a shell and parses stdout', async () => {
  const { createCliAdapterTransports } = await module();
  const transport = createCliAdapterTransports().find(item => item.protocol === 'cli-json-stdio');
  const ep = endpoint("let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.stringify({received:JSON.parse(s)})))");
  const result = await transport.execute(ep, request({ value: 42 }));
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.output, { received: { value: 42 } });
});
test('CLI environment is allowlisted and mapped from host keys', async () => {
  const { createCliAdapterTransports } = await module();
  const transport = createCliAdapterTransports()[0];
  const ep = endpoint("console.log(JSON.stringify({mapped:process.env.MAPPED_SECRET,leaked:process.env.UNRELATED_SECRET||null}))");
  ep.transport.inputMode = 'none';
  ep.transport.environment = [{ name: 'MAPPED_SECRET', environmentKey: 'SOURCE_SECRET' }];
  const result = await transport.execute(ep, request(null), { env: { PATH: process.env.PATH, SOURCE_SECRET: 'allowed-value', UNRELATED_SECRET: 'must-not-leak' } });
  assert.deepEqual(result.output, { mapped: 'allowed-value', leaked: null });
});

test('CLI nonzero exits and timeouts become normalized failed results', async () => {
  const { createCliAdapterTransports } = await module();
  const transport = createCliAdapterTransports()[0];
  const failure = endpoint("process.stderr.write('safe-error');process.exit(7)");
  failure.transport.inputMode = 'none'; failure.transport.outputMode = 'text';
  const failed = await transport.execute(failure, request(null));
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error.code, 'CLI_EXIT_7');

  const slow = endpoint("setTimeout(()=>console.log('{}'),500)");
  slow.transport.inputMode = 'none'; slow.transport.timeoutMs = 50;
  const timed = await transport.execute(slow, request(null));
  assert.equal(timed.status, 'failed');
  assert.equal(timed.error.code, 'CLI_TIMEOUT');
});