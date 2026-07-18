import { loadConfig } from '../apps/web/src/server/config';
import { getPrismaClient } from '../apps/web/src/server/infrastructure/prisma/prismaClient';
import {
  LocalHashEmbeddingService,
  OpenAiEmbeddingService,
  type EmbeddingProvider,
} from '../apps/web/src/server/embeddingService';
import { closeOpenAiFetch } from '../apps/web/src/server/openAiFetch';
import { chunkDocument } from '../apps/web/src/server/ragIngestion/chunker';
import {
  embedKnowledgeChunks,
  writeKnowledgeChunks,
} from '../apps/web/src/server/ragIngestion/knowledgeChunkWriter';
import type { IngestionDocument, IngestionSource } from '../apps/web/src/server/ragIngestion/types';

process.env.AUTH_DISABLED ??= 'true';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceFilter = argumentValue('--source');
const config = loadConfig();

if (!config.databaseUrl) throw new Error('DATABASE_URL is required.');
if (config.embeddingProvider === 'openai' && !config.openAiApiKey && !dryRun) {
  throw new Error('OPENAI_API_KEY is required for the OpenAI embedding profile.');
}

const db = getPrismaClient({
  connectionString: config.databaseUrl,
  max: config.postgresPoolMax,
  ssl: config.postgresSsl,
});
const snapshots = (await db.ragSourceSnapshot.findMany({ orderBy: { capturedAt: 'asc' } }))
  .map<SnapshotRow>((row) => {
    const metadata = parseMetadata(row.metadata);
    return {
      source_id: row.sourceId,
      uri: row.uri,
      title: row.title,
      content: row.content,
      metadata,
      captured_at: row.capturedAt,
      root_source_id: stringMetadata(metadata.rootSourceId) ?? row.sourceId,
    };
  })
  .filter((row) => !sourceFilter || row.root_source_id === sourceFilter);

if (!snapshots.length) throw new Error('No source snapshots matched the supplied filter.');

const embeddings: EmbeddingProvider =
  config.embeddingProvider === 'local'
    ? new LocalHashEmbeddingService()
    : new OpenAiEmbeddingService({
        apiKey: config.openAiApiKey,
        model: config.openAiEmbeddingModel,
        timeoutMs: config.openAiTimeoutMs,
        maxRetries: config.openAiMaxRetries,
      });
const groups = new Map<string, SnapshotRow[]>();
for (const row of snapshots) {
  const rows = groups.get(row.root_source_id) ?? [];
  rows.push(row);
  groups.set(row.root_source_id, rows);
}

for (const [rootSourceId, rows] of groups) {
  const chunks = rows.flatMap((row) => chunkDocument(snapshotDocument(row, rootSourceId)));
  if (!dryRun) {
    const embeddedChunks = await embedKnowledgeChunks(embeddings, chunks);
    await writeKnowledgeChunks(db, config.embeddingProfile, rootSourceId, embeddedChunks);
  }
  console.info(
    JSON.stringify({
      rootSourceId,
      embeddingProfile: config.embeddingProfile,
      snapshotCount: rows.length,
      chunkCount: chunks.length,
      status: dryRun ? 'dry_run' : 'indexed',
    }),
  );
}

await closeOpenAiFetch();
await db.$disconnect();

function snapshotDocument(row: SnapshotRow, rootSourceId: string): IngestionDocument {
  const metadata = parseMetadata(row.metadata);
  const source: IngestionSource = {
    id: row.source_id,
    kind: 'sharepoint_page',
    uri: row.uri,
    title: row.title,
    owner: stringMetadata(metadata.owner) ?? 'Snapshot import',
    accessScope: stringMetadata(metadata.accessScope) ?? 'all_users',
    refreshCadence: 'manual',
    metadata: { ...primitiveMetadata(metadata), rootSourceId },
  };

  return {
    source,
    title: row.title,
    text: row.content,
    updatedAt: new Date(row.captured_at).toISOString(),
  };
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function primitiveMetadata(
  value: Record<string, unknown>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string | number | boolean] =>
      ['string', 'number', 'boolean'].includes(typeof entry[1]),
    ),
  );
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function argumentValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

interface SnapshotRow {
  source_id: string;
  uri: string;
  title: string;
  content: string;
  metadata: unknown;
  captured_at: string | Date;
  root_source_id: string;
}
