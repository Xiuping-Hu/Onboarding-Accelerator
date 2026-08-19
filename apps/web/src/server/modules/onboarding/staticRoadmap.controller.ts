import type {
  TransitionOnboardingTaskRequest,
  TransitionOnboardingTaskResponse,
  UserRoadmapTaskState,
  WorkspaceOnboardingState,
} from '@onboarding/shared';
import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { AppError } from '../../core/errors/appError';
import { httpResult } from '../../core/http/httpResult';
import { parseJsonBody, parseParams } from '../../core/http/requestParsers';
import { safeHttpHref } from '../../sourceLinkService';
import {
  AcknowledgeStaticRoadmapNoticeBodySchema,
  StaticRoadmapEvidenceParamsSchema,
  StaticRoadmapNoticeParamsSchema,
  StaticRoadmapTaskParamsSchema,
  TransitionStaticRoadmapTaskBodySchema,
} from './staticRoadmap.dto';

type StaticRoadmapTaskTransitionResult =
  | {
      kind: 'updated' | 'replay';
      task: UserRoadmapTaskState;
      taskRevision: number;
      stateRevision: number;
    }
  | { kind: 'conflict'; latest: WorkspaceOnboardingState }
  | { kind: 'not_found' };

type StaticRoadmapNoticeAcknowledgementResult = { kind: 'acknowledged' } | { kind: 'not_found' };

/**
 * Narrow application boundary for the authenticated static-roadmap API.
 *
 * The concrete service owns owner filtering and atomic revision/idempotency behavior. Keeping the
 * controller dependent on this structural contract makes the HTTP surface independently testable.
 */
export interface StaticRoadmapServiceContract {
  getForUser(ownerId: string): Promise<WorkspaceOnboardingState>;
  transitionTask(
    ownerId: string,
    taskId: string,
    input: TransitionOnboardingTaskRequest,
  ): Promise<StaticRoadmapTaskTransitionResult>;
  acknowledgeNotice(
    ownerId: string,
    noticeId: string,
  ): Promise<StaticRoadmapNoticeAcknowledgementResult>;
  resolveEvidenceForUser(
    ownerId: string,
    evidenceId: string,
  ): Promise<{ title: string; excerpt: string; uri?: string } | null>;
}

export function createStaticRoadmapController(service: StaticRoadmapServiceContract) {
  const get: Controller = async (context) => {
    const user = requireControllerUser(context);
    return httpResult.json(await service.getForUser(user.id));
  };

  const transitionTask: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { taskId } = parseParams(context.params, StaticRoadmapTaskParamsSchema);
    const body = await parseJsonBody(context.request, TransitionStaticRoadmapTaskBodySchema);
    const result = await service.transitionTask(user.id, taskId, body);

    if (result.kind === 'not_found') {
      throw AppError.notFound('Roadmap task not found.');
    }
    if (result.kind === 'conflict') {
      return httpResult.json(
        {
          error: 'Roadmap progress changed. Reload the latest state and try again.',
          latest: result.latest,
        },
        409,
      );
    }

    const response: TransitionOnboardingTaskResponse = {
      task: result.task,
      taskRevision: result.taskRevision,
      stateRevision: result.stateRevision,
    };
    return httpResult.json(response);
  };

  const acknowledgeNotice: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { noticeId } = parseParams(context.params, StaticRoadmapNoticeParamsSchema);
    await parseJsonBody(context.request, AcknowledgeStaticRoadmapNoticeBodySchema);
    const result = await service.acknowledgeNotice(user.id, noticeId);

    if (result.kind === 'not_found') {
      throw AppError.notFound('Roadmap update notice not found.');
    }
    return httpResult.empty();
  };

  const openEvidence: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { evidenceId } = parseParams(context.params, StaticRoadmapEvidenceParamsSchema);
    const evidence = await service.resolveEvidenceForUser(user.id, evidenceId);
    if (!evidence) throw AppError.notFound('Roadmap evidence is unavailable.');

    const externalHref = safeHttpHref(evidence.uri);
    if (externalHref) return httpResult.redirect(externalHref);
    return httpResult.text(renderEvidencePreview(evidence.title, evidence.excerpt), 200, {
      'cache-control': 'private, no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'",
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
    });
  };

  return { get, transitionTask, acknowledgeNotice, openEvidence };
}

function renderEvidencePreview(title: string, excerpt: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; background: #f5f7fb; color: #1d2939; font: 16px/1.6 system-ui, sans-serif; }
      main { width: min(720px, calc(100% - 32px)); margin: 48px auto; border: 1px solid #d8e0eb;
        border-radius: 14px; padding: 24px; background: #fff; box-shadow: 0 12px 32px rgb(15 23 42 / 10%); }
      p { white-space: pre-wrap; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <main>
      <p><strong>Roadmap evidence</strong></p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(excerpt)}</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}
