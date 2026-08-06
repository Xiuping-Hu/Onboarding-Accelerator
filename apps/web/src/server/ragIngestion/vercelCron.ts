import { randomUUID, timingSafeEqual } from 'node:crypto';
import { dispatchDueSchedules } from './ingestionScheduler';
import { processNextIngestionRun, type IngestionWorkerOutcome } from './ingestionWorker';
import type { RagRuntime } from './runtime';

export type CronAuthorization = 'authorized' | 'missing_secret' | 'unauthorized';

export interface VercelCronResult {
  dispatch: { dispatched: number; duplicate: number };
  worker: IngestionWorkerOutcome;
}

export interface VercelCronDependencies {
  dispatch: typeof dispatchDueSchedules;
  processNext: typeof processNextIngestionRun;
}

const defaultDependencies: VercelCronDependencies = {
  dispatch: dispatchDueSchedules,
  processNext: processNextIngestionRun,
};

export function authorizeVercelCron(
  request: Request,
  secret: string | undefined,
): CronAuthorization {
  const normalizedSecret = secret?.trim();
  if (!normalizedSecret) return 'missing_secret';

  const actual = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${normalizedSecret}`;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return 'unauthorized';

  return timingSafeEqual(actualBuffer, expectedBuffer) ? 'authorized' : 'unauthorized';
}

export async function runVercelCronHeartbeat(
  runtime: Pick<RagRuntime, 'database' | 'service'>,
  dependencies: VercelCronDependencies = defaultDependencies,
): Promise<VercelCronResult> {
  const dispatch = await dependencies.dispatch(runtime.database);
  const worker = await dependencies.processNext(runtime, {
    workerId: `vercel:${process.env.VERCEL_REGION ?? 'unknown'}:${randomUUID()}`,
    // The route has a five-minute duration budget. A slightly longer lease prevents overlapping
    // execution while allowing a terminated invocation to be reclaimed by a later heartbeat.
    leaseSeconds: 360,
  });
  return { dispatch, worker };
}
