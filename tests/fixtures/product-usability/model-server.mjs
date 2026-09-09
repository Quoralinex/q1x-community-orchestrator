import { createServer } from 'node:http';

const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.statusCode = 404;
    response.end();
    return;
  }

  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  const message = Array.isArray(body.messages) ? body.messages.at(-1)?.content : undefined;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({
    model: body.model ?? 'phase12-fixture',
    choices: [{
      message: { role: 'assistant', content: message === 'phase12-product-model' ? 'phase12-product-model-ok' : 'phase12-model-ok' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  }));
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
process.stdout.write(`${JSON.stringify({ chatUrl: `http://127.0.0.1:${address.port}/v1/chat/completions` })}\n`);

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
