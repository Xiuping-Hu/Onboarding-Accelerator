import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  AiUsageModelSummary,
  AiUsageStats,
  LogEventRecord,
  LogEventsResponse,
  LogSummaryResponse,
} from '@onboarding/shared';

export interface RequestLogInput {
  requestId?: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userId?: string;
}

export interface AiUsageLogInput {
  operation: 'ask' | 'chat';
  usage: AiUsageStats;
  userId?: string;
  sessionId?: string;
}

export interface ErrorLogInput {
  requestId?: string;
  method?: string;
  path?: string;
  message: string;
  userId?: string;
}

export interface LogService {
  recordRequest(input: RequestLogInput): Promise<void>;
  recordAiUsage(input: AiUsageLogInput): Promise<void>;
  recordError(input: ErrorLogInput): Promise<void>;
  summarize(): Promise<LogSummaryResponse>;
  listRecent(limit?: number): Promise<LogEventsResponse>;
}

type LogEvent = RequestLogEvent | AiUsageLogEvent | ErrorLogEvent;

type BaseLogEvent = Pick<LogEventRecord, 'id' | 'timestamp' | 'level'>;

interface RequestLogEvent extends BaseLogEvent, RequestLogInput {
  type: 'request';
  level: 'info';
}

interface AiUsageLogEvent extends BaseLogEvent, AiUsageLogInput {
  type: 'ai_usage';
  level: 'info';
}

interface ErrorLogEvent extends BaseLogEvent, ErrorLogInput {
  type: 'error';
  level: 'error';
}

export class FileLogService implements LogService {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  async recordRequest(input: RequestLogInput): Promise<void> {
    await this.append({
      ...createBaseEvent('info'),
      type: 'request',
      ...input,
    });
  }

  async recordAiUsage(input: AiUsageLogInput): Promise<void> {
    await this.append({
      ...createBaseEvent('info'),
      type: 'ai_usage',
      ...input,
    });
  }

  async recordError(input: ErrorLogInput): Promise<void> {
    await this.append({
      ...createBaseEvent('error'),
      type: 'error',
      ...input,
    });
  }

  async summarize(): Promise<LogSummaryResponse> {
    const summary = createEmptySummary();
    const events = await this.readEvents();

    for (const event of events) {
      summary.eventsTotal += 1;
      summary.lastEventAt =
        !summary.lastEventAt || event.timestamp > summary.lastEventAt
          ? event.timestamp
          : summary.lastEventAt;

      if (event.type === 'request') {
        summary.requestsTotal += 1;
      }

      if (event.type === 'error') {
        summary.errorsTotal += 1;
      }

      if (event.type === 'ai_usage') {
        addUsage(summary.aiUsage, event.usage);
      }
    }

    return summary;
  }

  async listRecent(limit = 25): Promise<LogEventsResponse> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const events = await this.readEvents();

    return {
      events: events.slice(-safeLimit).reverse().map(toPublicLogEvent),
    };
  }

  private async append(event: LogEvent): Promise<void> {
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
      });

    await this.writeQueue;
  }

  private async readEvents(): Promise<LogEvent[]> {
    let content: string;

    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }

    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as LogEvent];
        } catch {
          return [];
        }
      });
  }
}

export class NoopLogService implements LogService {
  async recordRequest(): Promise<void> {}

  async recordAiUsage(): Promise<void> {}

  async recordError(): Promise<void> {}

  async summarize(): Promise<LogSummaryResponse> {
    return createEmptySummary();
  }

  async listRecent(): Promise<LogEventsResponse> {
    return { events: [] };
  }
}

function createBaseEvent<TLevel extends BaseLogEvent['level']>(
  level: TLevel,
): BaseLogEvent & { level: TLevel } {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    level,
  };
}

function createEmptySummary(): LogSummaryResponse {
  return {
    eventsTotal: 0,
    requestsTotal: 0,
    errorsTotal: 0,
    aiUsage: {
      model: 'all',
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedFeeUsd: 0,
      byModel: {},
    },
  };
}

function addUsage(summary: LogSummaryResponse['aiUsage'], usage: AiUsageStats): void {
  summary.requests += 1;
  summary.inputTokens += usage.inputTokens;
  summary.outputTokens += usage.outputTokens;
  summary.totalTokens += usage.totalTokens;
  summary.estimatedFeeUsd = roundFee(summary.estimatedFeeUsd + usage.estimatedFeeUsd);

  const modelSummary = (summary.byModel[usage.model] ??= createModelSummary(usage.model));
  modelSummary.requests += 1;
  modelSummary.inputTokens += usage.inputTokens;
  modelSummary.outputTokens += usage.outputTokens;
  modelSummary.totalTokens += usage.totalTokens;
  modelSummary.estimatedFeeUsd = roundFee(modelSummary.estimatedFeeUsd + usage.estimatedFeeUsd);
}

function createModelSummary(model: string): AiUsageModelSummary {
  return {
    model,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedFeeUsd: 0,
  };
}

function roundFee(value: number): number {
  return Number(value.toFixed(8));
}

function toPublicLogEvent(event: LogEvent): LogEventRecord {
  return event;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
