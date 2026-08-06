import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadSourceRegistry } from './sourceRegistry';

void test('source registry validates scheduled connector configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rag-registry-'));
  const path = join(directory, 'sources.json');
  try {
    await writeFile(
      path,
      JSON.stringify({
        sources: [
          {
            id: 'site',
            kind: 'website',
            connectorKind: 'http_website',
            uri: 'https://example.test/guide',
            owner: 'Owner',
            accessScope: 'all_users',
            allowedTriggers: ['manual', 'scheduled'],
            schedule: { cron: '0 2 * * 1', timezone: 'America/Chicago' },
          },
        ],
      }),
    );

    const registry = await loadSourceRegistry(path);

    assert.equal(registry.sources[0]?.connectorKind, 'http_website');
    assert.equal(registry.sources[0]?.schedule?.cron, '0 2 * * 1');
    assert.deepEqual(registry.sources[0]?.allowedTriggers, ['manual', 'scheduled']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('source registry rejects unsupported trigger modes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rag-registry-'));
  const path = join(directory, 'sources.json');
  try {
    await writeFile(
      path,
      JSON.stringify({
        sources: [
          {
            id: 'site',
            kind: 'website',
            uri: 'https://example.test/guide',
            owner: 'Owner',
            accessScope: 'all_users',
            allowedTriggers: ['autonomous_agent'],
          },
        ],
      }),
    );

    await assert.rejects(loadSourceRegistry(path), /unsupported trigger autonomous_agent/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
