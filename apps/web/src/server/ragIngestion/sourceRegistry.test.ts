import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertSingleStaticRoadmapAuthoritativeSource, loadSourceRegistry } from './sourceRegistry';

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

void test('static roadmap source validation fails closed for zero, multiple, or mismatched authorities', () => {
  const source = {
    id: 'tax-consulting-sharepoint',
    kind: 'sharepoint_folder' as const,
    uri: 'https://example.test',
    owner: 'owner',
    accessScope: 'all_users',
    roadmapAuthoritative: true,
  };
  assert.throws(
    () => assertSingleStaticRoadmapAuthoritativeSource({ sources: [] }, source.id),
    /exactly one.*found 0/i,
  );
  assert.throws(
    () =>
      assertSingleStaticRoadmapAuthoritativeSource(
        { sources: [source, { ...source, id: 'other' }] },
        source.id,
      ),
    /exactly one.*found 2/i,
  );
  assert.throws(
    () => assertSingleStaticRoadmapAuthoritativeSource({ sources: [source] }, 'other'),
    /does not match/i,
  );
  assert.throws(
    () =>
      assertSingleStaticRoadmapAuthoritativeSource(
        { sources: [{ ...source, enabled: false }] },
        source.id,
      ),
    /must be enabled/i,
  );
  assert.throws(
    () =>
      assertSingleStaticRoadmapAuthoritativeSource(
        { sources: [{ ...source, accessScope: 'private' }] },
        source.id,
      ),
    /all_users scope/i,
  );
  assert.equal(
    assertSingleStaticRoadmapAuthoritativeSource({ sources: [source] }, source.id).id,
    source.id,
  );
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
