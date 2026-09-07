let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input || '{}');
const action = request?.input?.action;

if (action === 'delay') {
  await new Promise(resolve => setTimeout(resolve, 250));
  process.stdout.write(JSON.stringify({ ok: true, output: { delayed: true } }));
} else if (action === 'fail') {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: { code: 'DESKTOP_FIXTURE_FAILURE', message: 'Fixture requested failure', retryable: false }
  }));
} else {
  process.stdout.write(JSON.stringify({
    ok: true,
    output: {
      protocol: request.protocol,
      requestId: request.requestId,
      workItemId: request.workItemId,
      input: request.input
    }
  }));
}
