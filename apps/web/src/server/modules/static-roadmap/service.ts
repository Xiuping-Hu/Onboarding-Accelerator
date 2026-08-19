import { randomUUID } from 'node:crypto';
import type { AnswerProvider } from '../../core/ports/answerProvider';
import { hashEvidenceBundle } from './canonical';
import { StaticRoadmapGenerator } from './generator';
import { LostStaticRoadmapClaimError, RetryableStaticRoadmapError } from './repository';
import type { StaticRoadmapPrismaRepository } from './repository';
import {
  STATIC_ROADMAP_EMPTY_STATE,
  type BootstrapStaticRoadmapInput,
  type EnqueueStaticRoadmapResult,
  type StaticNoticeAcknowledgementResult,
  type StaticRoadmapProcessResult,
  type StaticRoadmapUserSyncProcessResult,
  type StaticRoadmapView,
  type StaticTaskTransitionInput,
  type StaticTaskTransitionResult,
} from './types';
import type { PublicationHookInput } from './publicationHook';

export class StaticRoadmapService {
  private readonly generator: StaticRoadmapGenerator;

  constructor(
    private readonly repository: StaticRoadmapPrismaRepository,
    answers: AnswerProvider,
  ) {
    this.generator = new StaticRoadmapGenerator(answers);
  }

  getForUser(ownerId: string): Promise<StaticRoadmapView> {
    if (!isUuid(ownerId)) return Promise.resolve(structuredClone(STATIC_ROADMAP_EMPTY_STATE));
    return this.repository.getForUser(ownerId);
  }

  transitionTask(
    ownerId: string,
    taskId: string,
    input: StaticTaskTransitionInput,
  ): Promise<StaticTaskTransitionResult> {
    if (!isUuid(ownerId)) return Promise.resolve({ kind: 'not_found' });
    return this.repository.transitionTask(ownerId, taskId, input);
  }

  acknowledgeNotice(ownerId: string, noticeId: string): Promise<StaticNoticeAcknowledgementResult> {
    if (!isUuid(ownerId)) return Promise.resolve({ kind: 'not_found' });
    return this.repository.acknowledgeNotice(ownerId, noticeId);
  }

  resolveEvidenceForUser(ownerId: string, evidenceId: string) {
    if (!isUuid(ownerId)) return Promise.resolve(null);
    return this.repository.resolveEvidenceForUser(ownerId, evidenceId);
  }

  bootstrap(input: BootstrapStaticRoadmapInput | string): Promise<EnqueueStaticRoadmapResult> {
    return this.repository.bootstrap(typeof input === 'string' ? input : input.requestId);
  }

  enqueuePublication(input: PublicationHookInput): Promise<EnqueueStaticRoadmapResult> {
    return this.repository.enqueuePublication(input);
  }

  async processNextRefresh(workerId: string): Promise<StaticRoadmapProcessResult> {
    const job = await this.repository.claimNextRefresh(workerId);
    if (!job) return { processed: false };
    try {
      const evidence = await this.repository.captureEvidence(job);
      const evidenceBundleHash = hashEvidenceBundle(evidence);
      let roadmap = await this.repository.loadCachedArtifact(job, evidenceBundleHash);
      let usage: unknown;
      if (!roadmap) {
        // This check is intentionally adjacent to the model call; each retrieval query also joins
        // the live source authorization predicates, and publication fences them once more.
        await this.repository.assertRefreshAuthorized(job);
        const [lineageBase, historicalSemantics, historicalStageKeys] = await Promise.all([
          this.repository.loadLineage(job),
          this.repository.loadHistoricalSemantics(job.roadmapId),
          this.repository.loadHistoricalStageKeys(job.roadmapId),
        ]);
        const generated = await this.generator.generate({
          descriptor: job.input,
          knowledgeSnapshotHash: job.knowledgeSnapshotHash,
          evidence,
          lineageBase,
          priorSemanticsByKey: historicalSemantics,
          priorStageKeys: historicalStageKeys,
        });
        roadmap = generated.roadmap;
        usage = generated.usage;
      }
      const hashes = await this.repository.saveGeneratedArtifact(
        job,
        roadmap,
        evidenceBundleHash,
        usage,
      );
      const status = await this.repository.publishGeneratedArtifact(job, roadmap, {
        ...hashes,
        evidenceBundleHash,
      });
      return { processed: true, jobId: job.id, status };
    } catch (error) {
      if (error instanceof LostStaticRoadmapClaimError) {
        return {
          processed: true,
          jobId: job.id,
          status: 'retryable',
          error: error.message,
        };
      }
      const failure = await this.repository.failRefresh(
        job,
        isLikelyRetryableProviderError(error)
          ? new RetryableStaticRoadmapError(error instanceof Error ? error.message : String(error))
          : error,
      );
      return {
        processed: true,
        jobId: job.id,
        status: failure,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  processUserSyncs(workerId: string, limit?: number): Promise<StaticRoadmapUserSyncProcessResult> {
    return this.repository.processUserSyncBatch(workerId, limit);
  }

  async process(workerId = `static-roadmap:${randomUUID()}`): Promise<{
    refresh: StaticRoadmapProcessResult;
    userSyncs: StaticRoadmapUserSyncProcessResult;
  }> {
    const refresh = await this.processNextRefresh(workerId);
    const userSyncs = await this.processUserSyncs(workerId);
    return { refresh, userSyncs };
  }
}

export class DisabledStaticRoadmapService {
  async getForUser(_ownerId: string): Promise<StaticRoadmapView> {
    return structuredClone(STATIC_ROADMAP_EMPTY_STATE);
  }

  async transitionTask(
    _ownerId: string,
    _taskId: string,
    _input: StaticTaskTransitionInput,
  ): Promise<StaticTaskTransitionResult> {
    return { kind: 'not_found' };
  }

  async acknowledgeNotice(
    _ownerId: string,
    _noticeId: string,
  ): Promise<StaticNoticeAcknowledgementResult> {
    return { kind: 'not_found' };
  }

  async resolveEvidenceForUser(_ownerId: string, _evidenceId: string): Promise<null> {
    return null;
  }
}

export type StaticRoadmapFacade = Pick<
  StaticRoadmapService,
  'getForUser' | 'transitionTask' | 'acknowledgeNotice' | 'resolveEvidenceForUser'
>;

function isLikelyRetryableProviderError(error: unknown): boolean {
  if (error instanceof RetryableStaticRoadmapError) return true;
  if (!error || typeof error !== 'object') return false;
  if ('retryable' in error) return (error as { retryable?: unknown }).retryable === true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b(408|429|5\d\d|timeout|timed out|network|fetch|ECONN|upstream)\b/i.test(message);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
