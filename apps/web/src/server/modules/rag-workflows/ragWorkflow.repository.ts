import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import type { PrismaDatabase } from '../../infrastructure/prisma/prismaTypes';

export type StoredRagWorkflowStatus = 'running' | 'suspended' | 'failed' | 'completed';
export type StoredRagWorkflowPartition = 'refinement' | 'plan' | 'run' | 'complete';

export interface RagWorkflowRunRecord {
  id: string;
  workflowVersion: string;
  sessionId: string;
  ownerId: string;
  clientRequestId: string;
  status: StoredRagWorkflowStatus;
  currentPartition: StoredRagWorkflowPartition;
  planRevision: number;
  requestInput: unknown;
  refinement?: unknown;
  plan?: unknown;
  result?: unknown;
  lastFailure?: unknown;
  safeErrorCode?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface RagWorkflowRunUpdate {
  status?: StoredRagWorkflowStatus;
  currentPartition?: StoredRagWorkflowPartition;
  planRevision?: number;
  refinement?: unknown;
  plan?: unknown;
  result?: unknown;
  lastFailure?: unknown;
  safeErrorCode?: string;
  completedAt?: string;
}

export interface RagWorkflowAuditEventRecord {
  id: string;
  runId: string;
  actorUserId: string;
  eventType: string;
  partition?: string;
  stepId?: string;
  phaseId?: string;
  planRevision?: number;
  eventAt: string;
  reasonCode?: string;
  evidenceRefs: string[];
  inputHash?: string;
  outputHash?: string;
  metadata: Record<string, unknown>;
}

export interface AppendRagWorkflowAuditEvent extends Omit<
  RagWorkflowAuditEventRecord,
  'id' | 'eventAt'
> {
  id?: string;
  eventAt?: string;
}

export interface RagWorkflowRepository {
  findByClientRequest(
    ownerId: string,
    sessionId: string,
    clientRequestId: string,
  ): Promise<RagWorkflowRunRecord | undefined>;
  create(run: RagWorkflowRunRecord): Promise<RagWorkflowRunRecord>;
  get(runId: string, ownerId: string, sessionId: string): Promise<RagWorkflowRunRecord | undefined>;
  update(runId: string, update: RagWorkflowRunUpdate): Promise<RagWorkflowRunRecord>;
  appendAudit(event: AppendRagWorkflowAuditEvent): Promise<RagWorkflowAuditEventRecord>;
  listAudit(runId: string): Promise<RagWorkflowAuditEventRecord[]>;
}

export class InMemoryRagWorkflowRepository implements RagWorkflowRepository {
  private readonly runs = new Map<string, RagWorkflowRunRecord>();
  private readonly events: RagWorkflowAuditEventRecord[] = [];

  async findByClientRequest(
    ownerId: string,
    sessionId: string,
    clientRequestId: string,
  ): Promise<RagWorkflowRunRecord | undefined> {
    return clone(
      [...this.runs.values()].find(
        (run) =>
          run.ownerId === ownerId &&
          run.sessionId === sessionId &&
          run.clientRequestId === clientRequestId,
      ),
    );
  }

  async create(run: RagWorkflowRunRecord): Promise<RagWorkflowRunRecord> {
    this.runs.set(run.id, clone(run)!);
    return clone(run)!;
  }

  async get(
    runId: string,
    ownerId: string,
    sessionId: string,
  ): Promise<RagWorkflowRunRecord | undefined> {
    const run = this.runs.get(runId);
    return run?.ownerId === ownerId && run.sessionId === sessionId ? clone(run) : undefined;
  }

  async update(runId: string, update: RagWorkflowRunUpdate): Promise<RagWorkflowRunRecord> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Workflow run not found: ${runId}`);
    const updated = {
      ...run,
      ...clone(update),
      updatedAt: new Date().toISOString(),
    };
    this.runs.set(runId, updated);
    return clone(updated)!;
  }

  async appendAudit(event: AppendRagWorkflowAuditEvent): Promise<RagWorkflowAuditEventRecord> {
    const stored: RagWorkflowAuditEventRecord = {
      ...clone(event)!,
      id: event.id ?? randomUUID(),
      eventAt: event.eventAt ?? new Date().toISOString(),
    };
    this.events.push(stored);
    return clone(stored)!;
  }

  async listAudit(runId: string): Promise<RagWorkflowAuditEventRecord[]> {
    return this.events
      .filter((event) => event.runId === runId)
      .sort((a, b) => a.eventAt.localeCompare(b.eventAt))
      .map((event) => clone(event)!);
  }
}

export class PrismaRagWorkflowRepository implements RagWorkflowRepository {
  constructor(private readonly db: PrismaDatabase) {}

  async findByClientRequest(
    ownerId: string,
    sessionId: string,
    clientRequestId: string,
  ): Promise<RagWorkflowRunRecord | undefined> {
    return toRun(
      await this.db.ragWorkflowRun.findFirst({
        where: { ownerId, sessionId, clientRequestId },
      }),
    );
  }

  async create(run: RagWorkflowRunRecord): Promise<RagWorkflowRunRecord> {
    return requireRun(
      toRun(
        await this.db.ragWorkflowRun.create({
          data: {
            id: run.id,
            workflowVersion: run.workflowVersion,
            sessionId: run.sessionId,
            ownerId: run.ownerId,
            clientRequestId: run.clientRequestId,
            status: run.status,
            currentPartition: run.currentPartition,
            planRevision: run.planRevision,
            requestInput: toJson(run.requestInput),
            refinement: optionalJson(run.refinement),
            plan: optionalJson(run.plan),
            result: optionalJson(run.result),
            lastFailure: optionalJson(run.lastFailure),
            safeErrorCode: run.safeErrorCode,
            createdAt: new Date(run.createdAt),
            updatedAt: new Date(run.updatedAt),
            completedAt: run.completedAt ? new Date(run.completedAt) : undefined,
          },
        }),
      ),
    );
  }

  async get(
    runId: string,
    ownerId: string,
    sessionId: string,
  ): Promise<RagWorkflowRunRecord | undefined> {
    return toRun(
      await this.db.ragWorkflowRun.findFirst({
        where: { id: runId, ownerId, sessionId },
      }),
    );
  }

  async update(runId: string, update: RagWorkflowRunUpdate): Promise<RagWorkflowRunRecord> {
    return requireRun(
      toRun(
        await this.db.ragWorkflowRun.update({
          where: { id: runId },
          data: {
            status: update.status,
            currentPartition: update.currentPartition,
            planRevision: update.planRevision,
            ...(update.refinement === undefined
              ? {}
              : { refinement: optionalJson(update.refinement) }),
            ...(update.plan === undefined ? {} : { plan: optionalJson(update.plan) }),
            ...(update.result === undefined ? {} : { result: optionalJson(update.result) }),
            ...(update.lastFailure === undefined
              ? {}
              : { lastFailure: optionalJson(update.lastFailure) }),
            safeErrorCode: update.safeErrorCode,
            completedAt: update.completedAt ? new Date(update.completedAt) : undefined,
            updatedAt: new Date(),
          },
        }),
      ),
    );
  }

  async appendAudit(event: AppendRagWorkflowAuditEvent): Promise<RagWorkflowAuditEventRecord> {
    const row = await this.db.ragWorkflowAuditEvent.create({
      data: {
        id: event.id ?? randomUUID(),
        runId: event.runId,
        actorUserId: event.actorUserId,
        eventType: event.eventType,
        partition: event.partition,
        stepId: event.stepId,
        phaseId: event.phaseId,
        planRevision: event.planRevision,
        eventAt: event.eventAt ? new Date(event.eventAt) : undefined,
        reasonCode: event.reasonCode,
        evidenceRefs: toJson(event.evidenceRefs),
        inputHash: event.inputHash,
        outputHash: event.outputHash,
        metadata: toJson(event.metadata),
      },
    });
    return {
      id: row.id,
      runId: row.runId,
      actorUserId: row.actorUserId,
      eventType: row.eventType,
      partition: row.partition ?? undefined,
      stepId: row.stepId ?? undefined,
      phaseId: row.phaseId ?? undefined,
      planRevision: row.planRevision ?? undefined,
      eventAt: row.eventAt.toISOString(),
      reasonCode: row.reasonCode ?? undefined,
      evidenceRefs: parseJson<string[]>(row.evidenceRefs),
      inputHash: row.inputHash ?? undefined,
      outputHash: row.outputHash ?? undefined,
      metadata: parseJson<Record<string, unknown>>(row.metadata),
    };
  }

  async listAudit(runId: string): Promise<RagWorkflowAuditEventRecord[]> {
    const rows = await this.db.ragWorkflowAuditEvent.findMany({
      where: { runId },
      orderBy: { eventAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      actorUserId: row.actorUserId,
      eventType: row.eventType,
      partition: row.partition ?? undefined,
      stepId: row.stepId ?? undefined,
      phaseId: row.phaseId ?? undefined,
      planRevision: row.planRevision ?? undefined,
      eventAt: row.eventAt.toISOString(),
      reasonCode: row.reasonCode ?? undefined,
      evidenceRefs: parseJson<string[]>(row.evidenceRefs),
      inputHash: row.inputHash ?? undefined,
      outputHash: row.outputHash ?? undefined,
      metadata: parseJson<Record<string, unknown>>(row.metadata),
    }));
  }
}

function toRun(
  row: {
    id: string;
    workflowVersion: string;
    sessionId: string;
    ownerId: string;
    clientRequestId: string;
    status: string;
    currentPartition: string;
    planRevision: number;
    requestInput: Prisma.JsonValue;
    refinement: Prisma.JsonValue | null;
    plan: Prisma.JsonValue | null;
    result: Prisma.JsonValue | null;
    lastFailure: Prisma.JsonValue | null;
    safeErrorCode: string | null;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
  } | null,
): RagWorkflowRunRecord | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    workflowVersion: row.workflowVersion,
    sessionId: row.sessionId,
    ownerId: row.ownerId,
    clientRequestId: row.clientRequestId,
    status: row.status as StoredRagWorkflowStatus,
    currentPartition: row.currentPartition as StoredRagWorkflowPartition,
    planRevision: row.planRevision,
    requestInput: parseJson(row.requestInput),
    refinement: row.refinement === null ? undefined : parseJson(row.refinement),
    plan: row.plan === null ? undefined : parseJson(row.plan),
    result: row.result === null ? undefined : parseJson(row.result),
    lastFailure: row.lastFailure === null ? undefined : parseJson(row.lastFailure),
    safeErrorCode: row.safeErrorCode ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

function requireRun(run: RagWorkflowRunRecord | undefined): RagWorkflowRunRecord {
  if (!run) throw new Error('Workflow run was not persisted.');
  return run;
}

function optionalJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : toJson(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseJson<T>(value: Prisma.JsonValue): T {
  return structuredClone(value) as T;
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : (structuredClone(value) as T);
}
