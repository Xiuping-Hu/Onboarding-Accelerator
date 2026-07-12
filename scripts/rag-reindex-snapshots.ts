import { loadConfig } from '../apps/web/src/server/config';
import { getDatabasePool } from '../apps/web/src/server/database';
import {
  LocalHashEmbeddingService,
  OpenAiEmbeddingService,
  type EmbeddingProvider,
} from '../apps/web/src/server/embeddingService';
import { closeOpenAiFetch } from '../apps/web/src/server/openAiFetch';
import { chunkDocument } from '../apps/web/src/server/ragIngestion/chunker';
import { writeKnowledgeChunks } from '../apps/web/src/server/ragIngestion/knowledgeChunkWriter';
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

const db = getDatabasePool(config.databaseUrl);
const snapshots = await db.query<SnapshotRow>(
  `select source_id, uri, title, content, metadata, captured_at,
          coalesce(metadata->>'rootSourceId', source_id) as root_source_id
   from rag_source_snapshots
   where $1::text is null or coalesce(metadata->>'rootSourceId', source_id) = $1
   order by captured_at`,
  [sourceFilter ?? null],
);

if (!snapshots.rows.length) throw new Error('No source snapshots matched the supplied filter.');

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
for (const row of snapshots.rows) {
  const rows = groups.get(row.root_source_id) ?? [];
  rows.push(row);
  groups.set(row.root_source_id, rows);
}

for (const [rootSourceId, rows] of groups) {
  const chunks = rows.flatMap((row) => chunkDocument(snapshotDocument(row, rootSourceId)));
  if (!dryRun) {
    await writeKnowledgeChunks(db, embeddings, config.embeddingProfile, rootSourceId, chunks);
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
await db.end();

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
