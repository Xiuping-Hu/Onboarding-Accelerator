import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  initialScheduledIdempotencyKey,
  nextScheduledAt,
  synchronizeSourceRegistry,
} from './ingestionScheduler';

void test('nextScheduledAt respects the configured IANA timezone', () => {
  const next = nextScheduledAt(
    '0 2 * * *',
    'America/Chicago',
    new Date('2026-08-05T06:00:00.000Z'),
  );

  assert.equal(next.toISOString(), '2026-08-05T07:00:00.000Z');
});

void test('initial scheduled ingestion keys are stable per source', () => {
  assert.equal(
    initialScheduledIdempotencyKey('tax-consulting-sharepoint'),
    'scheduled-initial:tax-consulting-sharepoint',
  );
});

void test('source synchronization queues one initial run and preserves an unchanged schedule', async () => {
  const createdRuns = new Map<string, { id: string; status: string }>();
  const scheduleUpdates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const database = {
    knowledgeSource: {
      upsert: async () => ({}),
      findUnique: async () => ({ enabled: true, allowedTriggers: ['scheduled'] }),
    },
    ingestionSchedule: {
      findUnique: async () => ({ cronExpression: '0 2 * * 1', timezone: 'America/Chicago' }),
      upsert: async (input: { update: Record<string, unknown> }) => {
        scheduleUpdates.push(input.update);
        return { id: 'schedule-1' };
      },
    },
    ingestionRun: {
      findUnique: async (input: { where: { idempotencyKey: string } }) =>
        createdRuns.get(input.where.idempotencyKey) ?? null,
      create: async (input: { data: { idempotencyKey: string } }) => {
        const run = { id: 'run-1', status: 'queued' };
        createdRuns.set(input.data.idempotencyKey, run);
        return run;
      },
    },
    ingestionRunEvent: {
      create: async (input: { data: Record<string, unknown> }) => {
        events.push(input.data);
        return input.data;
      },
    },
  } as unknown as PrismaClient;
  const registry = {
    sources: [
      {
        id: 'tax-consulting-sharepoint',
        kind: 'sharepoint_page' as const,
        uri: 'https://taxconsultingza.sharepoint.com/',
        owner: 'Knowledge Owner',
        accessScope: 'all_users',
        allowedTriggers: ['scheduled' as const],
        schedule: {
          cron: '0 2 * * 1',
          timezone: 'America/Chicago',
          enabled: true,
        },
      },
    ],
  };

  const first = await synchronizeSourceRegistry(
    database,
    registry,
    new Date('2026-08-07T12:00:00.000Z'),
  );
  const second = await synchronizeSourceRegistry(
    database,
    registry,
    new Date('2026-08-07T12:05:00.000Z'),
  );

  assert.deepEqual(first, {
    sourceCount: 1,
    scheduleCount: 1,
    initialRunCount: 1,
    initialDuplicateCount: 0,
  });
  assert.deepEqual(second, {
    sourceCount: 1,
    scheduleCount: 1,
    initialRunCount: 0,
    initialDuplicateCount: 1,
  });
  assert.equal(createdRuns.size, 1);
  assert.equal(events.length, 1);
  assert.ok(scheduleUpdates.every((update) => !('nextRunAt' in update)));
});
