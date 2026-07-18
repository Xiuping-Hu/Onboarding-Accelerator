import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import type { PrismaDatabase } from '../infrastructure/prisma/prismaTypes';
import type { IngestionDocument, IngestionSource } from './types';

export async function registerSourceVersion(
  db: PrismaDatabase,
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
  const existing = await db.knowledgeSourceVersion.findUnique({
    where: { sourceId_contentHash: { sourceId: source.id, contentHash } },
    select: { id: true },
  });
  const versionId = existing?.id ?? randomUUID();

  await db.knowledgeSource.upsert({
    where: { id: source.id },
    create: {
      id: source.id,
      uri: source.uri,
      title: source.title ?? source.id,
      owner: source.owner,
      accessScope: source.accessScope,
      refreshCadence: source.refreshCadence ?? 'manual',
    },
    update: {
      uri: source.uri,
      title: source.title ?? source.id,
      owner: source.owner,
      accessScope: source.accessScope,
      refreshCadence: source.refreshCadence ?? 'manual',
      updatedAt: new Date(),
    },
  });
  if (!existing) {
    await db.knowledgeSourceVersion.create({
      data: {
        id: versionId,
        sourceId: source.id,
        contentHash,
        upstreamUpdatedAt: new Date(upstreamUpdatedAt),
        metadata: JSON.parse(
          JSON.stringify({ documentCount: documents.length, sourceKind: source.kind }),
        ) as Prisma.InputJsonValue,
      },
    });
  }
  await db.knowledgeSource.update({
    where: { id: source.id },
    data: { currentVersionId: versionId, updatedAt: new Date() },
  });
  return versionId;
}

function latestUpdatedAt(documents: IngestionDocument[]): string {
  return (
    documents
      .map((document) => document.updatedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? new Date().toISOString()
  );
}
