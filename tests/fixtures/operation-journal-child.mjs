import { OpenControlRuntime } from '../../packages/runtime/dist/index.js';

const home = process.argv[2];
if (!home) throw new Error('home required');
const runtime = OpenControlRuntime.open({ home });
const operation = runtime.beginExternalOperation({
  id: 'operation.crash.fixture',
  kind: 'adapter',
  subjectId: 'adapter.crash.fixture',
  retrySafe: false
});
runtime.markExternalOperationDispatched(operation.id);
process.send?.({ type: 'ready-to-dispatch', operationId: operation.id });
setInterval(() => {}, 1000);
