import { createServer } from 'node:http';

let baseUrl = '';
const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/.well-known/agent-card.json') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      protocolVersion: '0.3.0',
      name: 'Q1X Phase 12 Product Agent',
      description: 'Deterministic A2A product-usability fixture',
      url: `${baseUrl}/a2a`,
      preferredTransport: 'JSONRPC',
      capabilities: {},
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      skills: [{ id: 'echo', name: 'Echo', description: 'Echoes deterministic product text', tags: ['echo'] }],
    }));
    return;
  }

  if (request.method === 'POST' && request.url === '/a2a') {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const rpc = JSON.parse(raw);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      id: rpc.id,
      result: {
        kind: 'message',
        role: 'agent',
        messageId: 'phase12-product-message',
        parts: [{ kind: 'text', text: 'phase12-product-a2a-ok' }],
      },
    }));
    return;
  }

  response.statusCode = 404;
  response.end();
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
baseUrl = `http://127.0.0.1:${address.port}`;
process.stdout.write(`${JSON.stringify({ a2aUrl: `${baseUrl}/a2a` })}\n`);

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
