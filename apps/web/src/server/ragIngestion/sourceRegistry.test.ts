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

void test('source registry retains bounded SharePoint folder configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rag-registry-'));
  const path = join(directory, 'sources.json');
  try {
    await writeFile(
      path,
      JSON.stringify({
        sources: [
          {
            id: 'sharepoint-folder',
            kind: 'sharepoint_folder',
            uri: 'https://taxconsultingza.sharepoint.com/sites/TeamWeb/Shared%20Documents/Onboarding%20Accelerator',
            owner: 'Owner',
            accessScope: 'all_users',
            sharepoint: {
              sitePath: '/sites/TeamWeb',
              libraryName: 'Shared Documents',
              folderPath: 'Onboarding Accelerator',
              recursive: true,
              maxFiles: 100,
              maxDepth: 8,
              maxFileBytes: 10485760,
            },
          },
        ],
      }),
    );

    const registry = await loadSourceRegistry(path);

    assert.equal(registry.sources[0]?.connectorKind, undefined);
    assert.equal(registry.sources[0]?.sharepoint?.sitePath, '/sites/TeamWeb');
    assert.equal(registry.sources[0]?.sharepoint?.folderPath, 'Onboarding Accelerator');
    assert.equal(registry.sources[0]?.sharepoint?.maxFileBytes, 10485760);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
