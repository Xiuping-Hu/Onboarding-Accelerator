import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpWebsiteConnector, SharePointConnector } from './sourceConnectors';

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

void test('SharePoint connector resolves a tenant root site with the hostname endpoint', async () => {
  const requestedUrls: string[] = [];
  const responses = [
    Response.json({ access_token: 'graph-token' }),
    Response.json({ id: 'tenant-root-site' }),
    Response.json({ value: [] }),
  ];
  const connector = new SharePointConnector(
    { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret' },
    (async (input: RequestInfo | URL) => {
      requestedUrls.push(input.toString());
      const response = responses.shift();
      if (!response) throw new Error('Unexpected SharePoint request.');
      return response;
    }) as typeof fetch,
  );

  const result = await connector.acquire({
    id: 'sharepoint-root',
    kind: 'sharepoint_page',
    uri: 'https://taxconsultingza.sharepoint.com/',
    owner: 'Owner',
    accessScope: 'all_users',
    sharepoint: { crawlAllPages: true },
  });

  assert.equal(result.status, 'acquired');
  assert.equal(
    requestedUrls[1],
    'https://graph.microsoft.com/v1.0/sites/taxconsultingza.sharepoint.com',
  );
  assert.equal(
    requestedUrls[2],
    'https://graph.microsoft.com/v1.0/sites/tenant-root-site/pages?$select=id,name,title,lastModifiedDateTime,lastModifiedBy&$top=100',
  );
});
