#!/usr/bin/env node
import { createServer } from 'node:http';
import { OpenControlRuntime } from './runtime.js';
import './supervision-extension.js';

function integerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error(`${name} must be an integer from 1 to 65535`);
  return parsed;
}

const host = process.env.Q1X_HOST ?? '127.0.0.1';
const port = integerEnv('Q1X_PORT', 8787);
const runtime = OpenControlRuntime.open();
let ready = false;
let closing = false;

const server = createServer((request, response) => {
  if (request.method !== 'GET') {
    response.writeHead(405, { 'content-type': 'application/json', allow: 'GET' });
    response.end(JSON.stringify({ status: 'method-not-allowed' }));
    return;
  }
  if (request.url === '/healthz') {
    response.writeHead(closing ? 503 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ status: closing ? 'stopping' : 'ok' }));
    return;
  }
  if (request.url === '/readyz') {
    response.writeHead(ready && !closing ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ status: ready && !closing ? 'ready' : 'not-ready' }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ status: 'not-found' }));
});

async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  ready = false;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  runtime.close();
  process.stdout.write(`${JSON.stringify({ event: 'service.stopped', signal })}\n`);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(() => { process.exitCode = 0; }, error => {
      process.stderr.write(`${JSON.stringify({ event: 'service.stop-failed', message: error instanceof Error ? error.message : String(error) })}\n`);
      process.exitCode = 1;
    });
  });
}

server.on('error', error => {
  runtime.close();
  process.stderr.write(`${JSON.stringify({ event: 'service.error', message: error.message })}\n`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  ready = true;
  process.stdout.write(`${JSON.stringify({ event: 'service.ready', host, port, home: runtime.home })}\n`);
});
