import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalHashEmbeddingService } from './embeddingService';

void test('LocalHashEmbeddingService creates stable normalized pgvector-compatible vectors', async () => {
  const service = new LocalHashEmbeddingService();
  const first = await service.embed('team culture policies');
  const second = await service.embed('team culture policies');

  assert.equal(first.length, 1536);
  assert.deepEqual(first, second);
  const magnitude = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(magnitude - 1) < 1e-12);
});
