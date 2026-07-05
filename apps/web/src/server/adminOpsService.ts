import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  AdminActivityDeleteResponse,
  AdminActivityQuery,
  AdminActivityResponse,
  AdminActivitySummary,
  AdminAuditEvent,
  AdminAuditResponse,
  AiFeeModelSummary,
  AiFeeSummaryResponse,
  AiFeeAdjustment,
  AiFeeAdjustmentsResponse,
  AiRateCard,
  AiRateCardsResponse,
  CreateAiFeeAdjustmentRequest,
  CreateAiRateCardRequest,
  LogEventRecord,
} from '@onboarding/shared';
import type { AuthenticatedUser } from './auth';

export interface AdminAuditInput {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
  ipAddress?: string;
  userAgent?: string;
}

export class FileAdminAuditService {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  async record(input: AdminAuditInput): Promise<AdminAuditEvent> {
    const event: AdminAuditEvent = {
      id: randomUUID(),
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date().toISOString(),
    };

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
      });

    await this.writeQueue;
    return event;
  }

  async listRecent(limit = 50): Promise<AdminAuditResponse> {
    const events = await readJsonl<AdminAuditEvent>(this.filePath);
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    return { events: events.slice(-safeLimit).reverse() };
  }
}

export class AdminActivityLogService {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  async query(input: AdminActivityQuery = {}): Promise<AdminActivityResponse> {
    const limit = normalizeLimit(input.limit);
    const offset = parseCursor(input.cursor);
    const filtered = (await this.readEvents()).filter((event) =>
      matchesActivityQuery(event, input),
    );
    const page = filtered.slice(offset, offset + limit).map(redactLogEvent);
    const nextOffset = offset + limit;

    return {
      events: page,
      summary: summarizeActivity(filtered),
      ...(nextOffset < filtered.length ? { nextCursor: String(nextOffset) } : {}),
    };
  }

  async get(eventId: string): Promise<LogEventRecord | undefined> {
    const event = (await this.readEvents()).find((candidate) => candidate.id === eventId);
    return event ? redactLogEvent(event) : undefined;
  }

  async export(input: AdminActivityQuery = {}, format: 'csv' | 'jsonl' = 'csv'): Promise<string> {
    const events = (await this.readEvents()).filter((event) => matchesActivityQuery(event, input));
    const redacted = events.map(redactLogEvent);

    if (format === 'jsonl') {
      return redacted.map((event) => JSON.stringify(event)).join('\n');
    }

    const rows = redacted.map((event) => [
      event.id,
      event.timestamp,
      event.level,
      event.type,
      event.userId ?? '',
      event.sessionId ?? '',
      event.requestId ?? '',
      event.method ?? '',
      event.path ?? '',
      event.statusCode ?? '',
      event.operation ?? '',
      event.usage?.model ?? '',
      event.usage?.inputTokens ?? '',
      event.usage?.outputTokens ?? '',
      event.usage?.totalTokens ?? '',
      event.message ?? '',
    ]);

    return [
      [
        'id',
        'timestamp',
        'level',
        'type',
        'userId',
        'sessionId',
        'requestId',
        'method',
        'path',
        'statusCode',
        'operation',
        'model',
        'inputTokens',
        'outputTokens',
        'totalTokens',
        'message',
      ].join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
  }

  async delete(input: AdminActivityQuery): Promise<AdminActivityDeleteResponse> {
    if (!hasConstrainedFilter(input)) {
      throw new Error('Activity deletion requires at least one constrained filter');
    }

    let deletedCount = 0;
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const events = await this.readEvents();
        const remaining = events.filter((event) => {
          const shouldDelete = matchesActivityQuery(event, input);
          if (shouldDelete) {
            deletedCount += 1;
          }
          return !shouldDelete;
        });
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(
          this.filePath,
          remaining.map((event) => JSON.stringify(event)).join('\n') +
            (remaining.length > 0 ? '\n' : ''),
          'utf8',
        );
      });

    await this.writeQueue;
    return { deletedCount };
  }

  async readEvents(): Promise<LogEventRecord[]> {
    return readJsonl<LogEventRecord>(this.filePath);
  }
}

export class FileAiRateCardService {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  async list(): Promise<AiRateCardsResponse> {
    return { rateCards: await this.readCards() };
  }

  async create(input: CreateAiRateCardRequest, user: AuthenticatedUser): Promise<AiRateCard> {
    validateRateCard(input);
    const now = new Date().toISOString();
    const card: AiRateCard = {
      id: randomUUID(),
      provider: input.provider?.trim() || 'openai',
      model: input.model.trim(),
      currency: input.currency?.trim().toUpperCase() || 'USD',
      inputCostPer1MTokens: input.inputCostPer1MTokens,
      outputCostPer1MTokens: input.outputCostPer1MTokens,
      effectiveFrom: input.effectiveFrom ?? now,
      effectiveTo: input.effectiveTo,
      isActive: input.isActive ?? true,
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    };

    await this.writeCards([...(await this.readCards()), card]);
    return card;
  }

  async update(
    rateId: string,
    input: Partial<CreateAiRateCardRequest>,
    user: AuthenticatedUser,
  ): Promise<AiRateCard> {
    const cards = await this.readCards();
    const index = cards.findIndex((card) => card.id === rateId);
    if (index < 0) {
      throw new Error('AI rate card not found');
    }

    const existing = cards[index];
    if (!existing) {
      throw new Error('AI rate card not found');
    }
    const next: AiRateCard = {
      ...existing,
      provider: input.provider?.trim() || existing.provider,
      model: input.model?.trim() || existing.model,
      currency: input.currency?.trim().toUpperCase() || existing.currency,
      inputCostPer1MTokens: input.inputCostPer1MTokens ?? existing.inputCostPer1MTokens,
      outputCostPer1MTokens: input.outputCostPer1MTokens ?? existing.outputCostPer1MTokens,
      effectiveFrom: input.effectiveFrom ?? existing.effectiveFrom,
      effectiveTo: input.effectiveTo ?? existing.effectiveTo,
      isActive: input.isActive ?? existing.isActive,
      createdByUserId: existing.createdByUserId || user.id,
      updatedAt: new Date().toISOString(),
    };
    validateRateCard(next);
    cards[index] = next;
    await this.writeCards(cards);
    return next;
  }

  async findRate(model: string, timestamp: string): Promise<AiRateCard | undefined> {
    const at = new Date(timestamp).getTime();
    return (await this.readCards())
      .filter((card) => {
        const starts = new Date(card.effectiveFrom).getTime();
        const ends = card.effectiveTo
          ? new Date(card.effectiveTo).getTime()
          : Number.POSITIVE_INFINITY;
        return card.isActive && card.model === model && starts <= at && at <= ends;
      })
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  }

  private async readCards(): Promise<AiRateCard[]> {
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8')) as {
        rateCards?: AiRateCard[];
      };
      return Array.isArray(payload.rateCards) ? payload.rateCards : [];
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async writeCards(rateCards: AiRateCard[]): Promise<void> {
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify({ rateCards }, null, 2), 'utf8');
      });

    await this.writeQueue;
  }
}

export class FileAiFeeAdjustmentService {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  async listRecent(limit = 50): Promise<AiFeeAdjustmentsResponse> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const adjustments = await readJsonl<AiFeeAdjustment>(this.filePath);
    return { adjustments: adjustments.slice(-safeLimit).reverse() };
  }

  async create(
    input: CreateAiFeeAdjustmentRequest,
    user: AuthenticatedUser,
  ): Promise<AiFeeAdjustment> {
    if (!input.reason.trim()) {
      throw new Error('AI fee adjustment reason is required');
    }
    if (!Number.isFinite(input.amount)) {
      throw new Error('AI fee adjustment amount must be finite');
    }

    const adjustment: AiFeeAdjustment = {
      id: randomUUID(),
      usageEventId: input.usageEventId,
      amount: input.amount,
      currency: input.currency?.trim().toUpperCase() || 'USD',
      reason: input.reason.trim(),
      createdByUserId: user.id,
      createdAt: new Date().toISOString(),
    };

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await appendFile(this.filePath, `${JSON.stringify(adjustment)}\n`, 'utf8');
      });

    await this.writeQueue;
    return adjustment;
  }
}

export class AiFeeService {
  constructor(
    private readonly activity: AdminActivityLogService,
    private readonly rates: FileAiRateCardService,
  ) {}

  async summarize(query: AdminActivityQuery = {}): Promise<AiFeeSummaryResponse> {
    const events = (await this.activity.readEvents()).filter(
      (event) => event.type === 'ai_usage' && event.usage && matchesActivityQuery(event, query),
    );
    const summary: AiFeeSummaryResponse = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedFee: 0,
      currency: 'USD',
      missingRateCardRequests: 0,
      byModel: {},
    };

    for (const event of events) {
      if (!event.usage) {
        continue;
      }
      const rate = await this.rates.findRate(event.usage.model, event.timestamp);
      const estimatedFee = rate
        ? calculateFee(event.usage.inputTokens, event.usage.outputTokens, rate)
        : 0;
      const modelSummary = (summary.byModel[event.usage.model] ??= createFeeModelSummary(
        event.usage.model,
        rate?.currency ?? summary.currency,
      ));

      summary.requests += 1;
      summary.inputTokens += event.usage.inputTokens;
      summary.outputTokens += event.usage.outputTokens;
      summary.totalTokens += event.usage.totalTokens;
      summary.estimatedFee = roundMoney(summary.estimatedFee + estimatedFee);
      summary.missingRateCardRequests += rate ? 0 : 1;

      modelSummary.requests += 1;
      modelSummary.inputTokens += event.usage.inputTokens;
      modelSummary.outputTokens += event.usage.outputTokens;
      modelSummary.totalTokens += event.usage.totalTokens;
      modelSummary.estimatedFee = roundMoney(modelSummary.estimatedFee + estimatedFee);
      modelSummary.missingRateCardRequests += rate ? 0 : 1;
    }

    return summary;
  }
}

function matchesActivityQuery(event: LogEventRecord, query: AdminActivityQuery): boolean {
  if (query.eventType && event.type !== query.eventType) return false;
  if (query.userId && event.userId !== query.userId) return false;
  if (query.sessionId && event.sessionId !== query.sessionId) return false;
  if (query.requestId && event.requestId !== query.requestId) return false;
  if (query.statusCode && event.statusCode !== query.statusCode) return false;
  if (query.operation && event.operation !== query.operation) return false;
  if (query.model && event.usage?.model !== query.model) return false;
  if (query.from && event.timestamp < query.from) return false;
  if (query.to && event.timestamp > query.to) return false;
  return true;
}

function summarizeActivity(events: LogEventRecord[]): AdminActivitySummary {
  return events.reduce<AdminActivitySummary>(
    (summary, event) => {
      summary.eventsTotal += 1;
      if (event.type === 'error') summary.errorsTotal += 1;
      if (event.type === 'ai_usage' && event.usage) {
        summary.aiRequestsTotal += 1;
        summary.inputTokens += event.usage.inputTokens;
        summary.outputTokens += event.usage.outputTokens;
        summary.totalTokens += event.usage.totalTokens;
      }
      return summary;
    },
    {
      eventsTotal: 0,
      errorsTotal: 0,
      aiRequestsTotal: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  );
}

function redactLogEvent(event: LogEventRecord): LogEventRecord {
  return JSON.parse(
    JSON.stringify(event, (key, value: unknown) =>
      /authorization|cookie|password|secret|api[-_]?key|session[-_]?token|auth[-_]?token/i.test(key)
        ? '[redacted]'
        : value,
    ),
  ) as LogEventRecord;
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  try {
    return (await readFile(filePath, 'utf8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

function normalizeLimit(limit: number | undefined): number {
  return Math.min(Math.max(Math.trunc(limit ?? 25), 1), 100);
}

function parseCursor(cursor: string | undefined): number {
  const parsed = Number.parseInt(cursor ?? '0', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function hasConstrainedFilter(input: AdminActivityQuery): boolean {
  return Boolean(
    input.eventType ||
    input.userId ||
    input.sessionId ||
    input.requestId ||
    input.statusCode ||
    input.operation ||
    input.model ||
    input.from ||
    input.to,
  );
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function validateRateCard(input: CreateAiRateCardRequest | AiRateCard): void {
  if (!input.model.trim()) {
    throw new Error('Model is required');
  }
  if (input.inputCostPer1MTokens < 0 || input.outputCostPer1MTokens < 0) {
    throw new Error('AI rate costs must be non-negative');
  }
  if (input.effectiveTo && input.effectiveFrom && input.effectiveTo <= input.effectiveFrom) {
    throw new Error('Rate card effectiveTo must be after effectiveFrom');
  }
}

function calculateFee(inputTokens: number, outputTokens: number, rate: AiRateCard): number {
  return roundMoney(
    (inputTokens / 1_000_000) * rate.inputCostPer1MTokens +
      (outputTokens / 1_000_000) * rate.outputCostPer1MTokens,
  );
}

function createFeeModelSummary(model: string, currency: string): AiFeeModelSummary {
  return {
    model,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedFee: 0,
    currency,
    missingRateCardRequests: 0,
  };
}

function roundMoney(value: number): number {
  return Number(value.toFixed(8));
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
