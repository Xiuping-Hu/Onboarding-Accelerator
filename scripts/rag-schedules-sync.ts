import { resolve } from 'node:path';
import { loadSourceRegistry } from '../apps/web/src/server/ragIngestion/sourceRegistry';
import { synchronizeSourceRegistry } from '../apps/web/src/server/ragIngestion/ingestionScheduler';
import { createRagRuntime } from './rag-runtime';

process.env.AUTH_DISABLED ??= 'true';

const args = process.argv.slice(2);
const configIndex = args.indexOf('--config');
const registryPath = resolve(
  configIndex >= 0 ? (args[configIndex + 1] ?? '') : 'config/rag-sources.json',
);
if (!registryPath) throw new Error('--config requires a path.');

const runtime = createRagRuntime({ requireEmbeddings: false });
try {
  const registry = await loadSourceRegistry(registryPath);
  const result = await synchronizeSourceRegistry(runtime.database, registry);
  console.info(JSON.stringify(result));
} finally {
  await runtime.close();
}
