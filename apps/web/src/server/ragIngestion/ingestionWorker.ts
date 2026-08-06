import {
  claimNextIngestionRun,
  failClaimedIngestionRun,
  heartbeatIngestionRun,
  isTransientIngestionFailure,
  loadIngestionSource,
  requeueIngestionRun,
} from './ingestionScheduler';
import type { RagRuntime } from './runtime';

export interface IngestionWorkerOptions {
  workerId: string;
  leaseSeconds?: number;
  heartbeatIntervalMs?: number;
}

export type IngestionWorkerOutcome =
  | { processed: false }
  | {
      processed: true;
      runId: string;
      sourceId: string;
      attempt: number;
      status: 'indexed' | 'unchanged' | 'requires_review' | 'skipped' | 'failed' | 'requeued';
      chunkCount: number;
      safeErrorCode?: string;
    };

export async function processNextIngestionRun(
  runtime: Pick<RagRuntime, 'database' | 'service'>,
  options: IngestionWorkerOptions,
): Promise<IngestionWorkerOutcome> {
  const leaseSeconds = options.leaseSeconds ?? 900;
  const run = await claimNextIngestionRun(runtime.database, options.workerId, leaseSeconds);
  if (!run) return { processed: false };

  const heartbeat = setInterval(() => {
    void heartbeatIngestionRun(runtime.database, run.id, options.workerId, leaseSeconds).catch(
      () => undefined,
    );
  }, options.heartbeatIntervalMs ?? 30_000);
  heartbeat.unref();

  try {
    const source = await loadIngestionSource(runtime.database, run.sourceId);
    const report = await runtime.service.ingest(source, false, { runId: run.id });
    let safeErrorCode: string | undefined;

    if (report.status === 'failed') {
      const failedRun = await runtime.database.ingestionRun.findUnique({
        where: { id: run.id },
        select: { safeErrorCode: true },
      });
      safeErrorCode = failedRun?.safeErrorCode ?? undefined;
      if (run.attempt < 3 && isTransientIngestionFailure(safeErrorCode)) {
        await requeueIngestionRun(runtime.database, run.id, safeErrorCode ?? 'transient_failure');
        return {
          processed: true,
          runId: run.id,
          sourceId: run.sourceId,
          attempt: run.attempt,
          status: 'requeued',
          chunkCount: report.chunkCount,
          safeErrorCode,
        };
      }
    }

    return {
      processed: true,
      runId: run.id,
      sourceId: run.sourceId,
      attempt: run.attempt,
      status: report.status === 'dry_run' ? 'failed' : report.status,
      chunkCount: report.chunkCount,
      safeErrorCode,
    };
  } catch (error) {
    await failClaimedIngestionRun(runtime.database, run.id, error);
    return {
      processed: true,
      runId: run.id,
      sourceId: run.sourceId,
      attempt: run.attempt,
      status: 'failed',
      chunkCount: 0,
      safeErrorCode: 'worker_failed',
    };
  } finally {
    clearInterval(heartbeat);
  }
}
