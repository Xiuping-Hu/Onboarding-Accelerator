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

void test('SharePoint connector recursively acquires supported files from a document folder', async () => {
  const requestedUrls: string[] = [];
  const connector = new SharePointConnector(
    { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret' },
    (async (input: RequestInfo | URL) => {
      const url = input.toString();
      requestedUrls.push(url);
      if (url.includes('/oauth2/v2.0/token')) {
        return Response.json({ access_token: 'graph-token' });
      }
      if (url.endsWith('/sites/taxconsultingza.sharepoint.com:/sites/TeamWeb')) {
        return Response.json({ id: 'team-web-site' });
      }
      if (url.includes('/sites/team-web-site/drives?')) {
        return Response.json({
          value: [
            {
              id: 'documents-drive',
              name: 'Documents',
              webUrl: 'https://taxconsultingza.sharepoint.com/sites/TeamWeb/Shared%20Documents',
            },
          ],
        });
      }
      if (url.includes('/root:/Onboarding%20Accelerator:/children?')) {
        return Response.json({
          value: [
            {
              id: 'handbook',
              name: 'Handbook.docx',
              size: 4,
              eTag: 'handbook-v1',
              webUrl: 'https://taxconsultingza.sharepoint.com/Handbook.docx',
              lastModifiedDateTime: '2026-08-10T12:00:00.000Z',
              file: {
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              },
            },
            { id: 'policies', name: 'Policies', folder: { childCount: 1 } },
            {
              id: 'sheet',
              name: 'Checklist.xlsx',
              size: 4,
              file: {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              },
            },
          ],
        });
      }
      if (url.includes('/items/policies/children?')) {
        return Response.json({
          value: [
            {
              id: 'readme',
              name: 'Readme.txt',
              size: 7,
              webUrl: 'https://taxconsultingza.sharepoint.com/Policies/Readme.txt',
              file: { mimeType: 'text/plain' },
            },
          ],
        });
      }
      if (url.endsWith('/items/handbook/content')) {
        return new Response(new Uint8Array([1, 2, 3, 4]));
      }
      if (url.endsWith('/items/readme/content')) return new Response('Welcome');
      throw new Error(`Unexpected SharePoint request: ${url}`);
    }) as typeof fetch,
    1024,
  );

  const result = await connector.acquire({
    id: 'sharepoint-folder',
    kind: 'sharepoint_folder',
    uri: 'https://taxconsultingza.sharepoint.com/sites/TeamWeb/Shared%20Documents/Onboarding%20Accelerator',
    owner: 'Owner',
    accessScope: 'all_users',
    allowedContentTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ],
    sharepoint: {
      sitePath: '/sites/TeamWeb',
      libraryName: 'Shared Documents',
      folderPath: 'Onboarding Accelerator',
      recursive: true,
      maxFiles: 10,
    },
  });

  assert.equal(result.status, 'acquired');
  assert.equal(result.complete, true);
  assert.equal(result.artifacts.length, 2);
  assert.deepEqual(Array.from(result.artifacts[0]?.data ?? []), [1, 2, 3, 4]);
  assert.equal(result.artifacts[1]?.content, 'Welcome');
  assert.match(result.warnings.join('\n'), /Checklist\.xlsx/);
  assert.ok(
    requestedUrls.includes(
      'https://graph.microsoft.com/v1.0/sites/taxconsultingza.sharepoint.com:/sites/TeamWeb',
    ),
  );
});
