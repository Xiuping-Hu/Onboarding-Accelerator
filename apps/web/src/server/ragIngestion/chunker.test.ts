import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkDocument } from './chunker';

void test('chunkDocument produces stable IDs and source provenance metadata', () => {
  const document = {
    source: {
      id: 'wayfinder',
      kind: 'sharepoint_page' as const,
      uri: 'https://taxconsultingza.sharepoint.com/SitePages/Wayfinder.aspx',
      owner: 'Knowledge Owner',
      accessScope: 'all_users',
    },
    title: 'Wayfinder',
    text: 'Welcome to Wayfinder.\n\nFind your department policies here.',
    updatedAt: '2026-07-12T00:00:00.000Z',
  };

  const first = chunkDocument(document);
  const second = chunkDocument(document);

  assert.equal(first.length, 1);
  assert.equal(first[0]?.id, second[0]?.id);
  assert.equal(first[0]?.metadata.accessScope, 'all_users');
  assert.equal(first[0]?.metadata.sourceKind, 'sharepoint_page');
});
