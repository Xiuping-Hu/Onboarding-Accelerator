import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SharedDirectoryDocumentAdapter } from './ragAdapters/sharedDirectoryDocumentAdapter';
import { SharedDirectorySheetAdapter } from './ragAdapters/sharedDirectorySheetAdapter';
import { SharedDirectoryVideoAdapter } from './ragAdapters/sharedDirectoryVideoAdapter';
import { WebsiteAdapter } from './ragAdapters/websiteAdapter';

void test('document adapter retrieves text from shared markdown and text files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rag-docs-'));

  try {
    await writeFile(
      join(directory, 'first-week.md'),
      '# First week onboarding\n\nConfirm account access and meet your manager.',
    );
    const adapter = new SharedDirectoryDocumentAdapter({
      directory,
      maxFileBytes: 10_000,
      maxChunksPerSource: 4,
    });

    const sources = await adapter.retrieve('first week account access');

    assert.equal(sources[0]?.sourceType, 'knowledge_base');
    assert.match(sources[0]?.excerpt ?? '', /account access/i);
    assert.equal(sources[0]?.metadata?.sourceKind, 'shared_directory_document');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('sheet adapter retrieves owner and checklist rows from CSV files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rag-sheets-'));

  try {
    await writeFile(
      join(directory, 'checklist.csv'),
      'Task,Owner,Status\nLaptop pickup,IT,Ready\nBenefits checklist,People Team,Open\n',
    );
    const adapter = new SharedDirectorySheetAdapter({
      directory,
      maxFileBytes: 10_000,
      maxChunksPerSource: 4,
    });

    const sources = await adapter.retrieve('Who owns benefits checklist rows?');

    assert.equal(sources[0]?.sourceType, 'knowledge_base');
    assert.match(sources[0]?.excerpt ?? '', /Owner: People Team/i);
    assert.equal(sources[0]?.metadata?.sourceKind, 'shared_directory_sheet');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('video adapter retrieves setup training from transcript sidecars', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rag-videos-'));

  try {
    await writeFile(
      join(directory, 'setup-training.vtt'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nSetup training covers repository access and tool validation.\n',
    );
    const adapter = new SharedDirectoryVideoAdapter({
      directory,
      maxFileBytes: 10_000,
      maxChunksPerSource: 4,
    });

    const sources = await adapter.retrieve('setup training repository access');

    assert.equal(sources[0]?.sourceType, 'knowledge_base');
    assert.match(sources[0]?.excerpt ?? '', /repository access/i);
    assert.equal(sources[0]?.metadata?.transcriptSidecar, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('website adapter fetches allowed pages and retrieves readable chunks', async () => {
  const fetchCalls: string[] = [];
  const adapter = new WebsiteAdapter({
    allowlist: ['https://example.com/onboarding'],
    maxPageBytes: 10_000,
    maxChunksPerSource: 4,
    fetch: async (input) => {
      fetchCalls.push(input);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async text() {
          return '<html><title>Onboarding Portal</title><main>Allowed page explains setup training and access.</main></html>';
        },
      };
    },
  });

  const sources = await adapter.retrieve(
    'Find setup training at https://example.com/onboarding/setup',
  );

  assert.deepEqual(fetchCalls, ['https://example.com/onboarding/setup']);
  assert.equal(sources[0]?.sourceType, 'web');
  assert.equal(sources[0]?.title, 'Onboarding Portal');
  assert.match(sources[0]?.excerpt ?? '', /setup training/i);
});
