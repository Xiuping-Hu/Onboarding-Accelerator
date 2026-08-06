import { dispatchDueSchedules } from '../apps/web/src/server/ragIngestion/ingestionScheduler';
import { createRagRuntime } from './rag-runtime';

process.env.AUTH_DISABLED ??= 'true';

const runtime = createRagRuntime({ requireEmbeddings: false });
try {
  const result = await dispatchDueSchedules(runtime.database);
  console.info(JSON.stringify(result));
} finally {
  await runtime.close();
}
