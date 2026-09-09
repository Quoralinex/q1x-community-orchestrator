import { createServer } from 'node:http';

const server = createServer((request, response) => {
  if (request.url !== '/index.html' && request.url !== '/') {
    response.statusCode = 404;
    response.end('not found');
    return;
  }
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end('<!doctype html><html><body><h1>Phase 12 Product Browser</h1></body></html>');
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
process.stdout.write(`${JSON.stringify({ baseUrl: `http://127.0.0.1:${address.port}` })}\n`);

async function close() {
  await new Promise(resolve => server.close(resolve));
  process.exit(0);
}
process.once('SIGTERM', () => { void close(); });
process.once('SIGINT', () => { void close(); });
