import { randomUUID } from 'node:crypto';
import type { Controller } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { authorizeVercelCron } from '../../ragIngestion/vercelCron';
import type { StaticRoadmapService } from './service';
import type { EnqueueStaticRoadmapResult } from './types';

type StaticRoadmapCronBootstrapResult =
  | EnqueueStaticRoadmapResult
  | { kind: 'not_configured' }
  | { kind: 'failed'; error: 'Static roadmap bootstrap failed.' };

export function createStaticRoadmapCronController(input: {
  service?: Pick<StaticRoadmapService, 'bootstrap' | 'processNextRefresh' | 'processUserSyncs'>;
  enabled: boolean;
  secret?: string;
  bootstrapRequestId?: string;
}) {
  const run: Controller = async (context) => {
    const authorization = authorizeVercelCron(context.request, input.secret);
    if (authorization === 'missing_secret') {
      return httpResult.json(
        { ok: false, error: 'Static roadmap scheduling is not configured.' },
        503,
        { 'cache-control': 'no-store' },
      );
    }
    if (authorization === 'unauthorized') {
      return httpResult.json({ ok: false, error: 'Unauthorized.' }, 401, {
        'cache-control': 'no-store',
      });
    }
    if (!input.enabled || !input.service) {
      return httpResult.json({ ok: false, error: 'Static roadmap generation is disabled.' }, 503, {
        'cache-control': 'no-store',
      });
    }

    const workerId = `vercel:${process.env.VERCEL_REGION ?? 'unknown'}:static-roadmap:${randomUUID()}`;
    let bootstrap: StaticRoadmapCronBootstrapResult = { kind: 'not_configured' };
    let bootstrapFailed = false;
    if (input.bootstrapRequestId) {
      try {
        bootstrap = await input.service.bootstrap({ requestId: input.bootstrapRequestId });
      } catch {
        bootstrap = { kind: 'failed', error: 'Static roadmap bootstrap failed.' };
        bootstrapFailed = true;
        console.error(JSON.stringify({ event: 'static_roadmap_cron_bootstrap_failed' }));
      }
    }
    const refresh = await input.service.processNextRefresh(workerId);
    const userSyncs = await input.service.processUserSyncs(workerId);
    const result = { ok: !bootstrapFailed, workerId, bootstrap, refresh, userSyncs };
    console.info(JSON.stringify({ event: 'static_roadmap_cron_completed', ...result }));
    return httpResult.json(result, bootstrapFailed ? 500 : 200, { 'cache-control': 'no-store' });
  };

  return { run };
}
