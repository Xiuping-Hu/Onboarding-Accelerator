import type { Controller } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { createRagRuntime } from '../../ragIngestion/runtime';
import { authorizeVercelCron, runVercelCronHeartbeat } from '../../ragIngestion/vercelCron';

export function createRagIngestionCronController() {
  const run: Controller = async (context) => {
    const authorization = authorizeVercelCron(context.request, process.env.CRON_SECRET);
    if (authorization === 'missing_secret') {
      return noStore({ ok: false, error: 'Scheduled ingestion is not configured.' }, 503);
    }
    if (authorization === 'unauthorized') {
      return noStore({ ok: false, error: 'Unauthorized.' }, 401);
    }

    // Keep the shared database client alive so warm serverless invocations can reuse its pool.
    const ragRuntime = createRagRuntime();
    const result = await runVercelCronHeartbeat(ragRuntime);
    const latestRun = result.worker.processed
      ? undefined
      : await ragRuntime.database.ingestionRun.findFirst({
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            sourceId: true,
            status: true,
            attempt: true,
            safeErrorCode: true,
            safeErrorMessage: true,
            completedAt: true,
          },
        });
    console.info(
      JSON.stringify({
        event: 'rag_cron_completed',
        requestId: context.requestId,
        dispatched: result.dispatch.dispatched,
        duplicate: result.dispatch.duplicate,
        processed: result.worker.processed,
        runId: result.worker.processed ? result.worker.runId : undefined,
        sourceId: result.worker.processed ? result.worker.sourceId : latestRun?.sourceId,
        attempt: result.worker.processed ? result.worker.attempt : latestRun?.attempt,
        status: result.worker.processed ? result.worker.status : 'idle',
        safeErrorCode: result.worker.processed
          ? result.worker.safeErrorCode
          : latestRun?.safeErrorCode,
        latestRunId: latestRun?.id,
        latestRunStatus: latestRun?.status,
        latestRunErrorMessage: latestRun?.safeErrorMessage,
        latestRunCompletedAt: latestRun?.completedAt,
      }),
    );
    return noStore({ ok: true, ...result });
  };

  return { run };
}

function noStore(body: object, status = 200) {
  return httpResult.json(body, status, { 'Cache-Control': 'no-store' });
}
