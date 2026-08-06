import { hostname } from 'node:os';
import { processNextIngestionRun } from '../apps/web/src/server/ragIngestion/ingestionWorker';
import { createRagRuntime } from './rag-runtime';

process.env.AUTH_DISABLED ??= 'true';

const runtime = createRagRuntime();
const workerId = `${hostname()}:${process.pid}`;
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = Number.parseInt(limitIndex >= 0 ? (args[limitIndex + 1] ?? '1') : '1', 10);
if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
  throw new Error('--limit must be an integer between 1 and 100.');
}

let processed = 0;
try {
  while (processed < limit) {
    const outcome = await processNextIngestionRun(runtime, { workerId });
    if (!outcome.processed) break;
    console.info(JSON.stringify(outcome));
    if (outcome.status === 'failed') process.exitCode = 1;
    processed += 1;
  }
  console.info(JSON.stringify({ workerId, processed }));
} finally {
  await runtime.close();
}
