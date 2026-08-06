import { randomUUID } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { ensureKnowledgeSource } from './sourceVersionWriter';
import type {
  IngestionRegistry,
  IngestionSource,
  IngestionSourceKind,
  IngestionTriggerType,
} from './types';

export interface ClaimedIngestionRun {
  id: string;
  sourceId: string;
  triggerType: IngestionTriggerType;
  attempt: number;
  workerId: string;
}

interface DueScheduleRow {
  id: string;
  source_id: string;
  cron_expression: string;
  timezone: string;
  next_run_at: Date;
}

interface ClaimedRunRow {
  id: string;
  source_id: string;
  trigger_type: IngestionTriggerType;
  attempt: number;
  worker_id: string;
}

export function nextScheduledAt(cronExpression: string, timezone: string, currentDate: Date): Date {
  return CronExpressionParser.parse(cronExpression, {
    currentDate,
    tz: timezone,
  })
    .next()
    .toDate();
}

export async function synchronizeSourceRegistry(
  db: PrismaClient,
  registry: IngestionRegistry,
  now = new Date(),
): Promise<{ sourceCount: number; scheduleCount: number }> {
  let scheduleCount = 0;
  for (const source of registry.sources) {
    await ensureKnowledgeSource(db, source);
    if (!source.schedule) continue;
    if (!(source.allowedTriggers ?? ['manual']).includes('scheduled')) {
      throw new Error(`Scheduled source ${source.id} must allow the scheduled trigger.`);
    }
    const nextRunAt = nextScheduledAt(source.schedule.cron, source.schedule.timezone, now);
    await db.ingestionSchedule.upsert({
      where: { sourceId: source.id },
      create: {
        sourceId: source.id,
        cronExpression: source.schedule.cron,
        timezone: source.schedule.timezone,
        enabled: source.schedule.enabled !== false,
        nextRunAt,
        maxRuntimeSeconds: source.schedule.maxRuntimeSeconds ?? 900,
      },
      update: {
        cronExpression: source.schedule.cron,
        timezone: source.schedule.timezone,
        enabled: source.schedule.enabled !== false,
        nextRunAt,
        maxRuntimeSeconds: source.schedule.maxRuntimeSeconds ?? 900,
        updatedAt: now,
      },
    });
    scheduleCount += 1;
  }
  return { sourceCount: registry.sources.length, scheduleCount };
}

export async function dispatchDueSchedules(
  db: PrismaClient,
  now = new Date(),
  limit = 25,
): Promise<{ dispatched: number; duplicate: number }> {
  return db.$transaction(async (transaction) => {
    const schedules = await transaction.$queryRaw<DueScheduleRow[]>(Prisma.sql`
      select schedules.id,
             schedules.source_id,
             schedules.cron_expression,
             schedules.timezone,
             schedules.next_run_at
        from ingestion_schedules schedules
        join knowledge_sources sources on sources.id = schedules.source_id
       where schedules.enabled = true
         and sources.enabled = true
         and schedules.next_run_at <= ${now}
       order by schedules.next_run_at
       for update of schedules skip locked
       limit ${limit}`);

    let dispatched = 0;
    let duplicate = 0;
    for (const schedule of schedules) {
      const occurrence = new Date(schedule.next_run_at);
      const idempotencyKey = `scheduled:${schedule.source_id}:${schedule.id}:${occurrence.toISOString()}`;
      const existing = await transaction.ingestionRun.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        duplicate += 1;
      } else {
        const run = await transaction.ingestionRun.create({
          data: {
            sourceId: schedule.source_id,
            triggerType: 'scheduled',
            triggerRef: schedule.id,
            idempotencyKey,
            scheduledFor: occurrence,
          },
          select: { id: true },
        });
        await transaction.ingestionRunEvent.create({
          data: {
            runId: run.id,
            eventType: 'run_queued',
            metadata: jsonValue({
              scheduleId: schedule.id,
              scheduledFor: occurrence.toISOString(),
            }),
          },
        });
        dispatched += 1;
      }
      await transaction.ingestionSchedule.update({
        where: { id: schedule.id },
        data: {
          lastEnqueuedAt: now,
          nextRunAt: nextScheduledAt(schedule.cron_expression, schedule.timezone, now),
          updatedAt: now,
        },
      });
    }
    return { dispatched, duplicate };
  });
}

export async function requestIngestionRun(
  db: PrismaClient,
  input: {
    sourceId: string;
    triggerType: IngestionTriggerType;
    idempotencyKey: string;
    triggerRef?: string;
    requestedBy?: string;
  },
): Promise<{ id: string; created: boolean; status: string }> {
  const source = await db.knowledgeSource.findUnique({
    where: { id: input.sourceId },
    select: { enabled: true, allowedTriggers: true },
  });
  if (!source?.enabled) throw new Error(`Ingestion source ${input.sourceId} is not enabled.`);
  const allowedTriggers = stringArray(source.allowedTriggers);
  if (allowedTriggers.length && !allowedTriggers.includes(input.triggerType)) {
    throw new Error(`Source ${input.sourceId} does not allow ${input.triggerType} ingestion.`);
  }
  const existing = await db.ingestionRun.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, status: true },
  });
  if (existing) return { ...existing, created: false };

  let run: { id: string; status: string };
  try {
    run = await db.ingestionRun.create({
      data: {
        sourceId: input.sourceId,
        triggerType: input.triggerType,
        triggerRef: input.triggerRef,
        requestedBy: input.requestedBy,
        idempotencyKey: input.idempotencyKey,
      },
      select: { id: true, status: true },
    });
  } catch (error) {
    const raced = await db.ingestionRun.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, status: true },
    });
    if (raced) return { ...raced, created: false };
    throw error;
  }
  await db.ingestionRunEvent.create({
    data: {
      runId: run.id,
      eventType: 'run_queued',
      metadata: jsonValue({ triggerType: input.triggerType, requestedBy: input.requestedBy }),
    },
  });
  return { ...run, created: true };
}

export async function claimRequestedIngestionRun(
  db: PrismaClient,
  runId: string,
  workerId: string,
  leaseSeconds = 900,
  now = new Date(),
): Promise<ClaimedIngestionRun | null> {
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
  const rows = await db.$queryRaw<ClaimedRunRow[]>(Prisma.sql`
    update ingestion_runs requested
       set status = 'running',
           attempt = requested.attempt + 1,
           worker_id = ${workerId},
           lease_expires_at = ${leaseExpiresAt},
           heartbeat_at = ${now},
           started_at = coalesce(requested.started_at, ${now}),
           updated_at = ${now}
     where requested.id = ${runId}::uuid
       and requested.status = 'queued'
       and requested.available_at <= ${now}
       and not exists (
         select 1
           from ingestion_runs active
          where active.source_id = requested.source_id
            and active.id <> requested.id
            and active.status = 'running'
            and active.lease_expires_at >= ${now}
       )
     returning requested.id,
               requested.source_id,
               requested.trigger_type,
               requested.attempt,
               requested.worker_id`);
  const row = rows[0];
  if (!row) return null;
  await db.ingestionRunEvent.create({
    data: {
      runId: row.id,
      eventType: 'run_claimed',
      metadata: jsonValue({
        workerId,
        attempt: row.attempt,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
      }),
    },
  });
  return {
    id: row.id,
    sourceId: row.source_id,
    triggerType: row.trigger_type,
    attempt: row.attempt,
    workerId: row.worker_id,
  };
}

export async function claimNextIngestionRun(
  db: PrismaClient,
  workerId: string,
  leaseSeconds = 900,
  now = new Date(),
): Promise<ClaimedIngestionRun | null> {
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
  const rows = await db.$queryRaw<ClaimedRunRow[]>(Prisma.sql`
    with candidate as (
      select queued.id
        from ingestion_runs queued
       where queued.attempt < 3
         and queued.available_at <= ${now}
         and (
           queued.status = 'queued'
           or (queued.status = 'running' and queued.lease_expires_at < ${now})
         )
         and not exists (
           select 1
             from ingestion_runs active
            where active.source_id = queued.source_id
              and active.id <> queued.id
              and active.status = 'running'
              and active.lease_expires_at >= ${now}
         )
       order by queued.created_at
       for update skip locked
       limit 1
    )
    update ingestion_runs runs
       set status = 'running',
           attempt = runs.attempt + 1,
           worker_id = ${workerId},
           lease_expires_at = ${leaseExpiresAt},
           heartbeat_at = ${now},
           started_at = coalesce(runs.started_at, ${now}),
           completed_at = null,
           safe_error_code = null,
           safe_error_message = null,
           updated_at = ${now}
      from candidate
     where runs.id = candidate.id
     returning runs.id,
               runs.source_id,
               runs.trigger_type,
               runs.attempt,
               runs.worker_id`);
  const row = rows[0];
  if (!row) return null;
  await db.ingestionRunEvent.create({
    data: {
      runId: row.id,
      eventType: 'run_claimed',
      metadata: jsonValue({
        workerId,
        attempt: row.attempt,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
      }),
    },
  });
  return {
    id: row.id,
    sourceId: row.source_id,
    triggerType: row.trigger_type,
    attempt: row.attempt,
    workerId: row.worker_id,
  };
}

export async function heartbeatIngestionRun(
  db: PrismaClient,
  runId: string,
  workerId: string,
  leaseSeconds = 900,
  now = new Date(),
): Promise<boolean> {
  const result = await db.ingestionRun.updateMany({
    where: { id: runId, workerId, status: 'running' },
    data: {
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000),
      updatedAt: now,
    },
  });
  return result.count === 1;
}

export async function requeueIngestionRun(
  db: PrismaClient,
  runId: string,
  reasonCode: string,
): Promise<void> {
  const now = new Date();
  const run = await db.ingestionRun.findUnique({
    where: { id: runId },
    select: { attempt: true },
  });
  if (!run) throw new Error(`Ingestion run ${runId} was not found.`);
  const backoffSeconds = Math.min(300, 30 * 2 ** Math.max(0, run.attempt - 1));
  const jitterMs = Math.floor(Math.random() * 5_000);
  await db.$transaction([
    db.ingestionRun.update({
      where: { id: runId },
      data: {
        status: 'queued',
        workerId: null,
        leaseExpiresAt: null,
        completedAt: null,
        availableAt: new Date(now.getTime() + backoffSeconds * 1000 + jitterMs),
        safeErrorCode: reasonCode,
        updatedAt: now,
      },
    }),
    db.ingestionRunEvent.create({
      data: { runId, eventType: 'run_requeued', reasonCode, metadata: {} },
    }),
  ]);
}

export async function failClaimedIngestionRun(
  db: PrismaClient,
  runId: string,
  error: unknown,
): Promise<void> {
  const now = new Date();
  const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown worker error';
  await db.$transaction([
    db.ingestionRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        safeErrorCode: 'worker_failed',
        safeErrorMessage: message,
        completedAt: now,
        leaseExpiresAt: null,
        heartbeatAt: now,
        updatedAt: now,
      },
    }),
    db.ingestionRunEvent.create({
      data: {
        runId,
        eventType: 'run_failed',
        reasonCode: 'worker_failed',
        metadata: {},
      },
    }),
  ]);
}

export async function loadIngestionSource(
  db: PrismaClient,
  sourceId: string,
): Promise<IngestionSource> {
  const source = await db.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error(`Ingestion source ${sourceId} was not found.`);
  const config = record(source.connectorConfig);
  const kind = stringValue(config.legacyKind) as IngestionSourceKind | undefined;
  if (!kind)
    throw new Error(`Ingestion source ${sourceId} does not define its legacy content kind.`);
  return {
    id: source.id,
    kind,
    uri: source.uri,
    title: source.title,
    path: stringValue(config.path),
    owner: source.owner,
    accessScope: source.accessScope,
    refreshCadence: source.refreshCadence,
    connectorKind: source.connectorKind as IngestionSource['connectorKind'],
    allowedContentTypes: stringArray(source.allowedContentTypes),
    allowedTriggers: stringArray(source.allowedTriggers) as IngestionTriggerType[],
    credentialRef: source.credentialRef ?? undefined,
    publicationPolicy: source.publicationPolicy as IngestionSource['publicationPolicy'],
    reviewed: booleanValue(config.reviewed),
    enabled: source.enabled,
    metadata: primitiveRecord(config.metadata),
    sharepoint: sharePointConfig(config.sharepoint),
    website: websiteConfig(config.website),
    validation: validationConfig(config.validation),
  };
}

export function isTransientIngestionFailure(code: string | undefined): boolean {
  return ['upstream_rate_limited', 'upstream_unavailable', 'upstream_timeout'].includes(code ?? '');
}

export function manualIdempotencyKey(sourceId: string, requestId = randomUUID()): string {
  return `manual:${sourceId}:${requestId}`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function primitiveRecord(value: unknown): Record<string, string | number | boolean> | undefined {
  const entries = Object.entries(record(value)).filter(
    (entry): entry is [string, string | number | boolean] =>
      ['string', 'number', 'boolean'].includes(typeof entry[1]),
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function sharePointConfig(value: unknown): IngestionSource['sharepoint'] {
  const config = record(value);
  if (!Object.keys(config).length) return undefined;
  return {
    siteId: stringValue(config.siteId),
    pageName: stringValue(config.pageName),
    crawlAllPages: config.crawlAllPages === true,
    maxPages: numberValue(config.maxPages),
  };
}

function websiteConfig(value: unknown): IngestionSource['website'] {
  const config = record(value);
  if (!Object.keys(config).length) return undefined;
  return {
    allowedOrigins: stringArray(config.allowedOrigins),
    allowedPaths: stringArray(config.allowedPaths),
    maxRedirects: numberValue(config.maxRedirects),
    maxPageBytes: numberValue(config.maxPageBytes),
    timeoutMs: numberValue(config.timeoutMs),
  };
}

function validationConfig(value: unknown): IngestionSource['validation'] {
  const config = record(value);
  if (!Object.keys(config).length) return undefined;
  return {
    maximumReductionRatio:
      typeof config.maximumReductionRatio === 'number' ? config.maximumReductionRatio : undefined,
    requireManualReview: config.requireManualReview === true,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
