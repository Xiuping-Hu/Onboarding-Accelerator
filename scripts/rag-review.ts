import { reviewSourceVersion } from '../apps/web/src/server/ragIngestion/sourceVersionWriter';
import { createRagRuntime } from './rag-runtime';

process.env.AUTH_DISABLED ??= 'true';

const args = process.argv.slice(2);
const runId = argumentValue('--run');
const reviewedBy = argumentValue('--actor');
const approve = args.includes('--approve');
const reject = args.includes('--reject');
if (!runId || !reviewedBy || approve === reject) {
  throw new Error('Usage: rag:review -- --run <run-id> --actor <identity> (--approve|--reject)');
}

const runtime = createRagRuntime({ requireEmbeddings: false });
try {
  await reviewSourceVersion(runtime.database, { runId, approve, reviewedBy });
  console.info(JSON.stringify({ runId, decision: approve ? 'approved' : 'rejected', reviewedBy }));
} finally {
  await runtime.close();
}

function argumentValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
