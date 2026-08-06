import { rollbackSourceVersion } from '../apps/web/src/server/ragIngestion/sourceVersionWriter';
import { createRagRuntime } from './rag-runtime';

process.env.AUTH_DISABLED ??= 'true';

const args = process.argv.slice(2);
const sourceId = argumentValue('--source');
const sourceVersionId = argumentValue('--version');
const actor = argumentValue('--actor');
if (!sourceId || !sourceVersionId || !actor) {
  throw new Error(
    'Usage: rag:rollback -- --source <source-id> --version <version-id> --actor <identity>',
  );
}

const runtime = createRagRuntime({ requireEmbeddings: false });
try {
  const runId = await rollbackSourceVersion(runtime.database, {
    sourceId,
    sourceVersionId,
    actor,
    embeddingProfile: runtime.config.embeddingProfile,
  });
  console.info(JSON.stringify({ runId, sourceId, sourceVersionId, actor, status: 'succeeded' }));
} finally {
  await runtime.close();
}

function argumentValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
