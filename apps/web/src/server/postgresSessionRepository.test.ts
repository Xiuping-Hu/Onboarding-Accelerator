import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseClient } from './database';
import { PostgresSessionRepository } from './postgresSessionRepository';
import { SessionNotFoundError } from './sessionRepository';

void test('PostgresSessionRepository creates, lists, updates, and deletes scoped sessions', async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const db: DatabaseClient = {
    query: async (text, values = []) => {
      if (text.includes('insert into onboarding_sessions')) {
        const row = {
          id: values[0],
          owner_id: values[1],
          title: values[2],
          created_at: values[3],
          updated_at: values[4],
          settings: JSON.parse(String(values[5])),
          chat_history: JSON.parse(String(values[6])),
          guide: JSON.parse(String(values[7])),
        };
        rows.set(String(row.id), row);
        return result([row]);
      }

      if (text.includes('where owner_id = $1') && text.includes('order by updated_at desc')) {
        return result([...rows.values()].filter((row) => row.owner_id === values[0]));
      }

      if (text.includes('update onboarding_sessions')) {
        const row = rows.get(String(values[0]));
        if (!row) {
          return result([]);
        }
        Object.assign(row, {
          title: values[1],
          updated_at: values[2],
          settings: JSON.parse(String(values[3])),
          chat_history: JSON.parse(String(values[4])),
          guide: JSON.parse(String(values[5])),
        });
        return result([row]);
      }

      if (text.includes('delete from onboarding_sessions')) {
        const row = rows.get(String(values[0]));
        if (row?.owner_id !== values[1]) {
          return result([], 0);
        }
        rows.delete(String(values[0]));
        return result([], 1);
      }

      if (text.includes('where id = $1 and owner_id = $2')) {
        const row = rows.get(String(values[0]));
        return result(row && row.owner_id === values[1] ? [row] : []);
      }

      throw new Error(`Unexpected query: ${text}`);
    },
  };
  const sessions = new PostgresSessionRepository(db);
  const created = await sessions.create({ title: 'Database session' }, 'owner-a');

  assert.equal((await sessions.list('owner-a')).length, 1);
  assert.equal((await sessions.list('owner-b')).length, 0);

  const updated = await sessions.update(
    created.id,
    { title: 'Updated', settings: { webSearchEnabled: true } },
    'owner-a',
  );

  assert.equal(updated.title, 'Updated');
  assert.equal(updated.settings.webSearchEnabled, true);

  await assert.rejects(() => sessions.get(created.id, 'owner-b'), SessionNotFoundError);
  await sessions.delete(created.id, 'owner-a');
  await assert.rejects(() => sessions.get(created.id, 'owner-a'), SessionNotFoundError);
});

function result(rows: Record<string, unknown>[], rowCount = rows.length) {
  return {
    command: 'MOCK',
    rowCount,
    oid: 0,
    fields: [],
    rows,
  };
}
