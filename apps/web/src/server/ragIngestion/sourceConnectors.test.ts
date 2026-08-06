import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpWebsiteConnector } from './sourceConnectors';

const source = {
  id: 'site',
  kind: 'website' as const,
  uri: 'https://example.test/guide',
  owner: 'Owner',
  accessScope: 'all_users',
};

void test('website connector uses conditional requests and reports 304 as unchanged', async () => {
  let requestHeaders: Headers | undefined;
  const connector = new HttpWebsiteConnector({
    resolveHostname: async () => ['203.0.113.10'],
    fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestHeaders = new Headers(init?.headers);
      return new Response(null, { status: 304 });
    }) as typeof fetch,
  });

  const result = await connector.acquire(source, {
    previousDocuments: [
      {
        documentKey: 'site',
        canonicalUri: source.uri,
        contentHash: 'hash',
        etag: '"version-1"',
      },
    ],
  });

  assert.equal(result.status, 'unchanged');
  assert.equal(requestHeaders?.get('if-none-match'), '"version-1"');
});

void test('website connector rejects redirects outside the approved origin', async () => {
  const connector = new HttpWebsiteConnector({
    resolveHostname: async () => ['203.0.113.10'],
    fetch: (async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://unapproved.test/private' },
      })) as typeof fetch,
  });

  await assert.rejects(connector.acquire(source, { previousDocuments: [] }), /not allowlisted/);
});
