import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLegacySchema } from './legacy-prisma-baseline.mjs';

test('legacy baseline validation reports structural drift', () => {
  const snapshot = {
    tables: new Set(),
    columns: new Set(),
    columnNullability: new Map(),
    indexes: new Set(),
    constraints: new Map(),
    extensions: new Set(),
  };

  const mismatches = validateLegacySchema(snapshot);

  assert.ok(mismatches.includes('missing table onboarding_sessions'));
  assert.ok(mismatches.includes('missing index users_microsoft_identity_key'));
  assert.ok(mismatches.includes('missing extension vector'));
  assert.ok(mismatches.includes('users.password_hash is not nullable'));
  assert.ok(mismatches.includes('knowledge_chunks_pkey is not the expected composite key'));
});
