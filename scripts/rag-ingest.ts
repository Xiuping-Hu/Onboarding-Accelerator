import { resolve } from 'node:path';
import { loadConfig } from '../apps/web/src/server/config';
import { getDatabasePool } from '../apps/web/src/server/database';
import {
  LocalHashEmbeddingService,
  OpenAiEmbeddingService,
} from '../apps/web/src/server/embeddingService';
import { closeOpenAiFetch } from '../apps/web/src/server/openAiFetch';
import { RagIngestionService } from '../apps/web/src/server/ragIngestion/ingestionService';
import { loadSourceRegistry } from '../apps/web/src/server/ragIngestion/sourceRegistry';

// This command has its own database requirement and must be able to dry-run without app auth.
process.env.AUTH_DISABLED ??= 'true';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceId = argumentValue('--source');
const sourceKind = argumentValue('--type');
const registryPath = resolve(argumentValue('--config') ?? 'config/rag-sources.json');
const config = loadConfig();

if (!config.databaseUrl && !dryRun)
  throw new Error('DATABASE_URL is required unless --dry-run is used.');
if (config.embeddingProvider === 'openai' && !config.openAiApiKey && !dryRun)
  throw new Error('OPENAI_API_KEY is required unless --dry-run is used.');

const registry = await loadSourceRegistry(registryPath);
const sources = registry.sources.filter(
  (source) => (!sourceId || source.id === sourceId) && (!sourceKind || source.kind === sourceKind),
);
if (!sources.length) throw new Error('No registered sources match the supplied filter.');

const database = config.databaseUrl
  ? getDatabasePool(config.databaseUrl)
  : { query: async () => ({ command: 'SELECT', rowCount: 0, oid: 0, fields: [], rows: [] }) };
const service = new RagIngestionService(
  database,
  config.embeddingProvider === 'local'
    ? new LocalHashEmbeddingService()
    : new OpenAiEmbeddingService({
        apiKey: config.openAiApiKey,
        model: config.openAiEmbeddingModel,
        timeoutMs: config.openAiTimeoutMs,
        maxRetries: config.openAiMaxRetries,
      }),
  {
    tenantId: process.env.RAG_SHAREPOINT_TENANT_ID,
    clientId: process.env.RAG_SHAREPOINT_CLIENT_ID,
    clientSecret: process.env.RAG_SHAREPOINT_CLIENT_SECRET,
  },
  config.ragAllowedAccessScopes,
  config.embeddingProfile,
);

const reports = await Promise.all(sources.map((source) => service.ingest(source, dryRun)));
for (const report of reports) console.info(JSON.stringify(report));
if (reports.some((report) => report.status === 'failed')) process.exitCode = 1;
await closeOpenAiFetch();

function argumentValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
