import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../database';
import type { IngestionDocument, IngestionSource } from './types';

export async function registerSourceVersion(
  db: DatabaseClient,
  source: IngestionSource,
  documents: IngestionDocument[],
): Promise<string> {
  const contentHash = createHash('sha256')
    .update(
      documents
        .map((document) => `${document.title}\n${document.updatedAt}\n${document.text}`)
        .join('\n\n'),
    )
    .digest('hex');
  const upstreamUpdatedAt = latestUpdatedAt(documents);
  const existing = await db.query<{ id: string }>(
    `select id from knowledge_source_versions where source_id = $1 and content_hash = $2`,
    [source.id, contentHash],
  );
  const versionId = existing.rows[0]?.id ?? randomUUID();

  await db.query(
    `insert into knowledge_sources
     (id, uri, title, owner, access_scope, refresh_cadence, current_version_id, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, null, now(), now())
     on conflict (id) do update set
       uri = excluded.uri, title = excluded.title, owner = excluded.owner,
       access_scope = excluded.access_scope, refresh_cadence = excluded.refresh_cadence,
       updated_at = now()`,
    [
      source.id,
      source.uri,
      source.title ?? source.id,
      source.owner,
      source.accessScope,
      source.refreshCadence ?? 'manual',
    ],
  );
  if (!existing.rows[0]) {
    await db.query(
      `insert into knowledge_source_versions
       (id, source_id, content_hash, upstream_updated_at, captured_at, metadata)
       values ($1, $2, $3, $4, now(), $5::jsonb)`,
      [
        versionId,
        source.id,
        contentHash,
        upstreamUpdatedAt,
        JSON.stringify({ documentCount: documents.length, sourceKind: source.kind }),
      ],
    );
  }
  await db.query(
    `update knowledge_sources set current_version_id = $2, updated_at = now() where id = $1`,
    [source.id, versionId],
  );
  return versionId;
}

function latestUpdatedAt(documents: IngestionDocument[]): string {
  return (
    documents
      .map((document) => document.updatedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? new Date().toISOString()
  );
}
