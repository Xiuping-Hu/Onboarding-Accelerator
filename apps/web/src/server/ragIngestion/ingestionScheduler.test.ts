import assert from 'node:assert/strict';
import test from 'node:test';
import { nextScheduledAt } from './ingestionScheduler';

void test('nextScheduledAt respects the configured IANA timezone', () => {
  const next = nextScheduledAt(
    '0 2 * * *',
    'America/Chicago',
    new Date('2026-08-05T06:00:00.000Z'),
  );

  assert.equal(next.toISOString(), '2026-08-05T07:00:00.000Z');
});
