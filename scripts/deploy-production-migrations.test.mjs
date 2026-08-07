import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production preparation synchronizes the committed RAG source registry after migrations', async () => {
  const script = await readFile(
    new URL('./deploy-production-migrations.mjs', import.meta.url),
    'utf8',
  );

  const migrationIndex = script.indexOf("'db:migrate:deploy'");
  const prismaGenerateIndex = script.indexOf("'prisma:generate'");
  const scheduleSyncIndex = script.indexOf("'rag:schedules:sync'");

  assert.ok(migrationIndex >= 0, 'production preparation must deploy migrations');
  assert.ok(
    prismaGenerateIndex > migrationIndex,
    'Prisma client generation must follow migrations',
  );
  assert.ok(
    scheduleSyncIndex > prismaGenerateIndex,
    'source sync must run after Prisma client generation',
  );
  assert.match(script, /'config\/rag-sources\.json'/);
});
