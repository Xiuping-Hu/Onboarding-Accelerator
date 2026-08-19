import { randomUUID } from 'node:crypto';
import type {
  OnboardingProgress,
  OnboardingTaskStatus,
  RoadmapUpdateNotice,
  SourceReference,
  StaticRoadmapStage,
  UserRoadmapTaskState,
} from '@onboarding/shared';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { EmbeddingProvider } from '../../embeddingService';
import { formatVector } from '../../pgvectorKnowledgeBase';
import {
  hashCanonical,
  hashEvidenceBundle,
  hashRoadmapContent,
  hashTaskSemantics,
  StaticRoadmapValidationError,
} from './canonical';
import {
  enqueueStaticRoadmapRefreshForPublication,
  type PublicationHookInput,
} from './publicationHook';
import { isValidRoadmapTaskStatus, parseLegacyPreflightContext } from './legacyPreflight';
import { resolveLegacyOwnerQuarantine } from './legacyOwnerResolution';
import {
  capturedUserSyncDisposition,
  eligibleInitialBackfillUsers,
  shouldCreateRoadmapUpdateNotice,
} from './reconciliationPolicy';
import {
  DEFAULT_STATIC_ROADMAP_KEY,
  STATIC_ROADMAP_EMPTY_STATE,
  type CanonicalStaticRoadmap,
  type CanonicalStaticRoadmapStage,
  type ClaimedRefreshJob,
  type EnqueueStaticRoadmapResult,
  type StaticNoticeAcknowledgementResult,
  type StaticRoadmapConfig,
  type StaticRoadmapEvidence,
  type StaticRoadmapInput,
  type StaticRoadmapView,
  type StaticTaskTransitionInput,
  type StaticTaskTransitionResult,
} from './types';

const retrievalQueries = [
  'new team member responsibilities recurring workflows and expected outcomes',
  'tools systems procedures handoffs and practical work examples',
  'quality controls compliance review escalation and completion standards',
] as const;

type EvidenceRow = {
  id: string;
  title: string;
  excerpt: string;
  uri: string | null;
  section_key: string | null;
  score: number | string;
};

type LockedRoadmapRow = {
  id: string;
  current_version_id: string | null;
  revision: number;
  latest_refresh_sequence: bigint;
  last_published_refresh_sequence: bigint;
  suspended_at: Date | null;
};

type ClaimedUserSync = {
  id: string;
  rolloutId: string | null;
  roadmapId: string;
  userId: string;
  targetVersionId: string;
  claimToken: number;
  attempt: number;
  initialAccount: boolean;
};

export class StaticRoadmapPrismaRepository {
  constructor(
    readonly db: PrismaClient,
    private readonly embeddings: EmbeddingProvider,
    readonly config: StaticRoadmapConfig,
  ) {}

  async enqueuePublication(input: PublicationHookInput): Promise<EnqueueStaticRoadmapResult> {
    return this.db.$transaction((transaction) =>
      enqueueStaticRoadmapRefreshForPublication(transaction, input, this.config),
    );
  }

  async bootstrap(requestId: string): Promise<EnqueueStaticRoadmapResult> {
    if (!requestId.trim())
      throw new StaticRoadmapValidationError('A bootstrap request ID is required.');
    let result: EnqueueStaticRoadmapResult;
    try {
      result = await this.db.$transaction(async (transaction) => {
        const source = await transaction.knowledgeSource.findUnique({
          where: { id: this.config.authoritativeSourceId },
          select: {
            id: true,
            currentVersionId: true,
            enabled: true,
            accessScope: true,
            currentVersion: { select: { status: true } },
          },
        });
        if (!source) {
          return {
            kind: 'waiting_for_source' as const,
            reason: 'authoritative_source_missing' as const,
          };
        }
        if (!source.enabled || source.accessScope !== 'all_users') {
          throw new StaticRoadmapValidationError(
            'The authoritative knowledge source must be enabled and all_users.',
          );
        }
        if (!source.currentVersionId || source.currentVersion?.status !== 'published') {
          return {
            kind: 'waiting_for_source' as const,
            reason: 'authoritative_source_not_published' as const,
          };
        }
        return enqueueStaticRoadmapRefreshForPublication(
          transaction,
          {
            sourceId: source.id,
            sourceVersionId: source.currentVersionId,
            publicationEventId: `operator:${requestId}`,
            operatorRequestId: requestId,
          },
          this.config,
        );
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const root = await this.db.onboardingRoadmap.findUnique({
        where: { key: DEFAULT_STATIC_ROADMAP_KEY },
        select: { id: true },
      });
      const duplicate = root
        ? await this.db.onboardingRoadmapRefreshJob.findUnique({
            where: {
              roadmapId_operatorRequestId: { roadmapId: root.id, operatorRequestId: requestId },
            },
            select: { id: true, refreshSequence: true, status: true },
          })
        : null;
      if (!duplicate) throw error;
      result = {
        kind: 'duplicate',
        jobId: duplicate.id,
        refreshSequence: duplicate.refreshSequence.toString(),
        jobStatus: duplicate.status as Extract<
          EnqueueStaticRoadmapResult,
          { kind: 'duplicate' }
        >['jobStatus'],
      };
    }
    if (result.kind === 'ignored') {
      throw new StaticRoadmapValidationError(
        'Canonical roadmap bootstrap is blocked by the persisted legacy integrity audit.',
      );
    }
    return result;
  }

  async claimNextRefresh(workerId: string): Promise<ClaimedRefreshJob | null> {
    if (!this.config.enabled || !this.config.refreshClaimsEnabled) return null;
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + this.config.leaseMs);
    return this.db.$transaction(async (transaction) => {
      const candidates = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        select jobs.id
          from onboarding_roadmap_refresh_jobs jobs
         where (
           (jobs.status in ('queued', 'retryable') and jobs.available_at <= ${now})
           or (jobs.status = 'running' and jobs.lease_expires_at < ${now})
         )
           and not exists (
             select 1
               from onboarding_roadmap_rollouts rollouts
              where rollouts.roadmap_id = jobs.roadmap_id
                and rollouts.status in ('pending', 'running')
           )
         order by jobs.refresh_sequence desc, jobs.created_at
         for update skip locked
         limit 1`);
      const candidate = candidates[0];
      if (!candidate) return null;
      const current = await transaction.onboardingRoadmapRefreshJob.findUnique({
        where: { id: candidate.id },
      });
      if (!current) return null;
      const claimed = await transaction.onboardingRoadmapRefreshJob.update({
        where: { id: current.id },
        data: {
          status: 'running',
          attempt: { increment: 1 },
          claimToken: { increment: 1 },
          claimedBy: workerId,
          leaseExpiresAt,
          startedAt: current.startedAt ?? now,
          errorCode: null,
          errorMessage: null,
          updatedAt: now,
        },
      });
      return {
        id: claimed.id,
        roadmapId: claimed.roadmapId,
        claimToken: claimed.claimToken,
        claimedBy: workerId,
        leaseExpiresAt,
        attempt: claimed.attempt,
        refreshSequence: claimed.refreshSequence,
        input: cloneJson(claimed.inputDescriptor) as unknown as StaticRoadmapInput,
        knowledgeSnapshotHash: claimed.knowledgeSnapshotHash,
        artifactKey: claimed.artifactKey,
        ...(claimed.evidenceBundle
          ? {
              evidenceBundle: cloneJson(
                claimed.evidenceBundle,
              ) as unknown as StaticRoadmapEvidence[],
            }
          : {}),
      };
    });
  }

  async captureEvidence(job: ClaimedRefreshJob): Promise<StaticRoadmapEvidence[]> {
    this.assertCapturedWorkerConfig(job);
    if (job.evidenceBundle?.length) return job.evidenceBundle;
    const source = await this.db.knowledgeSource.findUnique({
      where: { id: job.input.sourceId },
      select: { currentVersionId: true, enabled: true, accessScope: true },
    });
    if (
      !source ||
      source.currentVersionId !== job.input.sourceVersionId ||
      !source.enabled ||
      source.accessScope !== 'all_users'
    ) {
      throw new StaticRoadmapValidationError(
        'The captured authoritative source is no longer current and authorized.',
      );
    }

    const embeddings = await Promise.all(
      retrievalQueries.map((query) => this.embeddings.embed(query)),
    );
    if (embeddings.some((embedding) => !embedding?.length)) {
      throw new RetryableStaticRoadmapError('Embedding generation returned no vector.');
    }
    const evidence: StaticRoadmapEvidence[] = [];
    for (let queryIndex = 0; queryIndex < retrievalQueries.length; queryIndex += 1) {
      const vector = formatVector(embeddings[queryIndex]!);
      const rows = await this.db.$queryRaw<EvidenceRow[]>(Prisma.sql`
        select chunks.id,
               chunks.title,
               chunks.excerpt,
               chunks.uri,
               chunks.section_key,
               greatest(0, 1 - (chunks.embedding <=> ${vector}::vector)) as score
         from knowledge_chunks chunks
          join knowledge_sources sources on sources.id = chunks.source_id
         where chunks.source_id = ${job.input.sourceId}
           and chunks.source_version_id = ${job.input.sourceVersionId}
           and chunks.embedding_profile = ${job.input.embeddingProfileId}
           and sources.enabled = true
           and sources.access_scope = 'all_users'
           and sources.current_version_id = ${job.input.sourceVersionId}
           and coalesce(chunks.metadata->>'accessScope', 'all_users') = 'all_users'
         order by chunks.embedding <=> ${vector}::vector, chunks.id
         limit ${this.config.retrievalLimitPerQuery}`);
      rows.forEach((row, rank) => {
        evidence.push({
          id: `${job.input.sourceVersionId}:${job.input.embeddingProfileId}:${row.id}:q${queryIndex}`,
          chunkId: row.id,
          sourceId: job.input.sourceId,
          sourceVersionId: job.input.sourceVersionId,
          embeddingProfileId: job.input.embeddingProfileId,
          ...(row.section_key ? { sectionKey: row.section_key } : {}),
          title: row.title,
          excerpt: row.excerpt,
          ...(row.uri ? { uri: row.uri } : {}),
          queryIndex,
          rank: rank + 1,
          score: typeof row.score === 'number' ? row.score : Number.parseFloat(String(row.score)),
        });
      });
    }
    if (!evidence.length) {
      throw new StaticRoadmapValidationError(
        'No all_users evidence exists for the captured source version and embedding profile.',
      );
    }
    const bundleHash = hashEvidenceBundle(evidence);
    return this.db.$transaction(async (transaction) => {
      const stored = await transaction.onboardingRoadmapRefreshJob.updateMany({
        where: {
          id: job.id,
          status: 'running',
          claimToken: job.claimToken,
          claimedBy: job.claimedBy,
          leaseExpiresAt: { gt: new Date() },
          evidenceBundle: { equals: Prisma.DbNull },
        },
        data: {
          evidenceBundle: toJson(evidence),
          evidenceBundleHash: bundleHash,
          updatedAt: new Date(),
        },
      });
      if (stored.count !== 1) {
        const current = await transaction.onboardingRoadmapRefreshJob.findUnique({
          where: { id: job.id },
          select: { evidenceBundle: true },
        });
        if (!current?.evidenceBundle) throw new LostStaticRoadmapClaimError();
        return cloneJson(current.evidenceBundle) as unknown as StaticRoadmapEvidence[];
      }
      await transaction.onboardingRoadmapEvidencePin.create({
        data: {
          id: randomUUID(),
          roadmapId: job.roadmapId,
          sourceVersionId: job.input.sourceVersionId,
          refreshJobId: job.id,
          evidenceBundleHash: bundleHash,
        },
      });
      return evidence;
    });
  }

  async loadLineage(job: ClaimedRefreshJob): Promise<CanonicalStaticRoadmap | null> {
    const versionId = job.input.lineageBaseCanonicalVersionId;
    if (!versionId) return null;
    const version = await this.db.onboardingJourneyVersion.findUnique({
      where: { id: versionId },
      select: { title: true, stages: true, sourceReferences: true, contentHash: true },
    });
    if (!version || version.contentHash !== job.input.lineageBaseContentHash) {
      throw new StaticRoadmapValidationError('The captured canonical lineage base is unavailable.');
    }
    return {
      title: version.title,
      stages: cloneJson(version.stages) as unknown as CanonicalStaticRoadmapStage[],
      sourceReferences: cloneJson(version.sourceReferences) as unknown as SourceReference[],
      assumptions: [],
      warnings: [],
    };
  }

  async loadHistoricalSemantics(roadmapId: string): Promise<Map<string, string>> {
    const versions = await this.db.onboardingJourneyVersion.findMany({
      where: { roadmapId },
      select: { stages: true },
      orderBy: { versionNumber: 'asc' },
    });
    const result = new Map<string, string>();
    for (const version of versions) {
      for (const stage of cloneJson(version.stages) as unknown as CanonicalStaticRoadmapStage[]) {
        for (const task of stage.tasks) {
          const prior = result.get(task.stableKey);
          if (prior && prior !== task.semanticsHash) {
            throw new StaticRoadmapValidationError(
              `Canonical history contains conflicting semantics for ${task.stableKey}.`,
            );
          }
          result.set(task.stableKey, task.semanticsHash);
        }
      }
    }
    return result;
  }

  async loadHistoricalStageKeys(roadmapId: string): Promise<Set<string>> {
    const versions = await this.db.onboardingJourneyVersion.findMany({
      where: { roadmapId },
      select: { stages: true },
      orderBy: { versionNumber: 'asc' },
    });
    return new Set(
      versions.flatMap((version) =>
        (cloneJson(version.stages) as unknown as CanonicalStaticRoadmapStage[]).map(
          (stage) => stage.stableKey,
        ),
      ),
    );
  }

  async loadCachedArtifact(
    job: ClaimedRefreshJob,
    evidenceBundleHash: string,
  ): Promise<CanonicalStaticRoadmap | null> {
    const current = await this.db.onboardingRoadmapRefreshJob.findUnique({
      where: { id: job.id },
      select: {
        status: true,
        claimToken: true,
        claimedBy: true,
        artifactKey: true,
        evidenceBundleHash: true,
        generatedArtifact: true,
      },
    });
    if (
      current?.status === 'running' &&
      current.claimToken === job.claimToken &&
      current.claimedBy === job.claimedBy &&
      current.artifactKey === job.artifactKey &&
      current.evidenceBundleHash === evidenceBundleHash &&
      current.generatedArtifact
    ) {
      return cloneJson(current.generatedArtifact) as unknown as CanonicalStaticRoadmap;
    }
    const cached = await this.db.onboardingRoadmapRefreshJob.findFirst({
      where: {
        roadmapId: job.roadmapId,
        artifactKey: job.artifactKey,
        evidenceBundleHash,
        status: { in: ['published', 'equivalent'] },
        generatedArtifact: { not: Prisma.DbNull },
        id: { not: job.id },
      },
      orderBy: { completedAt: 'desc' },
      select: { generatedArtifact: true },
    });
    if (cached?.generatedArtifact) {
      return cloneJson(cached.generatedArtifact) as unknown as CanonicalStaticRoadmap;
    }

    // A source-pointer rollback to the exact immutable snapshot may intentionally republish
    // historical canonical content (A -> B -> A). It is the sole exception to current-lineage
    // tombstones: every captured input/evidence and generator-governance field must match the
    // prior successful publication, and the artifact must still match its immutable version hash.
    const historical = await this.db.onboardingRoadmapRefreshJob.findFirst({
      where: {
        id: { not: job.id },
        roadmapId: job.roadmapId,
        status: 'published',
        sourceId: job.input.sourceId,
        sourceVersionId: job.input.sourceVersionId,
        knowledgeSnapshotHash: job.knowledgeSnapshotHash,
        evidenceBundleHash,
        embeddingProfileId: job.input.embeddingProfileId,
        retrievalConfigVersion: job.input.retrievalConfigVersion,
        retrievalQuerySetVersion: job.input.retrievalQuerySetVersion,
        objectiveVersion: job.input.objectiveVersion,
        generatorSchemaVersion: job.input.generatorSchemaVersion,
        promptVersion: job.input.promptVersion,
        provider: job.input.provider,
        model: job.input.model,
        decodingConfigVersion: job.input.decodingConfigVersion,
        generatedArtifact: { not: Prisma.DbNull },
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true, generatedArtifact: true },
    });
    if (!historical?.generatedArtifact) return null;
    const historicalVersion = await this.db.onboardingJourneyVersion.findUnique({
      where: { generationJobId: historical.id },
      select: { contentHash: true },
    });
    const artifact = cloneJson(historical.generatedArtifact) as unknown as CanonicalStaticRoadmap;
    if (
      !historicalVersion?.contentHash ||
      historicalVersion.contentHash !== hashRoadmapContent(artifact)
    ) {
      throw new StaticRoadmapValidationError(
        'The historical rollback artifact does not match its immutable canonical version.',
      );
    }
    return artifact;
  }

  async saveGeneratedArtifact(
    job: ClaimedRefreshJob,
    roadmap: CanonicalStaticRoadmap,
    evidenceBundleHash: string,
    usage: unknown,
  ): Promise<{ contentHash: string; evidenceHash: string }> {
    const contentHash = hashRoadmapContent(roadmap);
    const evidenceHash = hashEvidenceBundle(
      (
        await this.db.onboardingRoadmapRefreshJob.findUnique({
          where: { id: job.id },
          select: { evidenceBundle: true },
        })
      )?.evidenceBundle as unknown as StaticRoadmapEvidence[],
    );
    const updated = await this.db.onboardingRoadmapRefreshJob.updateMany({
      where: {
        id: job.id,
        status: 'running',
        claimToken: job.claimToken,
        claimedBy: job.claimedBy,
        leaseExpiresAt: { gt: new Date() },
      },
      data: {
        generatedArtifact: toJson(roadmap),
        generatedContentHash: contentHash,
        generatedEvidenceHash: evidenceHash,
        evidenceBundleHash,
        providerUsage: usage === undefined ? undefined : toJson(usage),
        updatedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new LostStaticRoadmapClaimError();
    return { contentHash, evidenceHash };
  }

  async publishGeneratedArtifact(
    job: ClaimedRefreshJob,
    roadmap: CanonicalStaticRoadmap,
    hashes: { contentHash: string; evidenceHash: string; evidenceBundleHash: string },
  ): Promise<'published' | 'equivalent' | 'stale' | 'retryable'> {
    if (
      !this.config.refreshClaimsEnabled ||
      process.env.STATIC_ROADMAP_REFRESH_CLAIMS_ENABLED === 'false'
    ) {
      await this.deferRefresh(job, 'REFRESH_KILL_SWITCH', 'Static roadmap publication is paused.');
      return 'retryable';
    }
    return this.db.$transaction(async (transaction) => {
      const roots = await transaction.$queryRaw<LockedRoadmapRow[]>(Prisma.sql`
        select id,
               current_version_id,
               revision,
               latest_refresh_sequence,
               last_published_refresh_sequence,
               suspended_at
          from onboarding_roadmaps
         where id = ${job.roadmapId}::uuid
         for update`);
      const root = roots[0];
      if (!root) throw new LostStaticRoadmapClaimError('The canonical roadmap root is missing.');
      const durableJob = await transaction.onboardingRoadmapRefreshJob.findUnique({
        where: { id: job.id },
      });
      if (
        !durableJob ||
        durableJob.status !== 'running' ||
        durableJob.claimToken !== job.claimToken ||
        durableJob.claimedBy !== job.claimedBy ||
        !durableJob.leaseExpiresAt ||
        durableJob.leaseExpiresAt <= new Date()
      ) {
        throw new LostStaticRoadmapClaimError();
      }
      const source = await transaction.knowledgeSource.findUnique({
        where: { id: durableJob.sourceId },
        select: { currentVersionId: true, enabled: true, accessScope: true },
      });
      const stale =
        durableJob.sourceId !== this.config.authoritativeSourceId ||
        !source ||
        !source.enabled ||
        source.accessScope !== 'all_users' ||
        source.currentVersionId !== durableJob.sourceVersionId ||
        root.latest_refresh_sequence !== durableJob.refreshSequence ||
        root.current_version_id !== durableJob.lineageBaseVersionId;
      if (stale) {
        await transaction.onboardingRoadmapRefreshJob.updateMany({
          where: {
            id: job.id,
            status: 'running',
            claimToken: job.claimToken,
            claimedBy: job.claimedBy,
            leaseExpiresAt: { gt: new Date() },
          },
          data: {
            status: 'stale',
            completedAt: new Date(),
            leaseExpiresAt: null,
            claimedBy: null,
            errorCode: 'STALE_INPUT',
            errorMessage: 'A newer or unauthorized knowledge/canonical snapshot won publication.',
            updatedAt: new Date(),
          },
        });
        return 'stale';
      }

      const activeRollout = await transaction.onboardingRoadmapRollout.findFirst({
        where: { roadmapId: root.id, status: { in: ['pending', 'running'] } },
        select: { id: true },
      });
      if (activeRollout) {
        await transaction.onboardingRoadmapRefreshJob.updateMany({
          where: {
            id: job.id,
            status: 'running',
            claimToken: job.claimToken,
            claimedBy: job.claimedBy,
            leaseExpiresAt: { gt: new Date() },
          },
          data: {
            status: 'retryable',
            availableAt: new Date(Date.now() + this.config.retryBaseMs),
            leaseExpiresAt: null,
            claimedBy: null,
            errorCode: 'ROLLOUT_IN_PROGRESS',
            errorMessage: 'A prior canonical rollout is still reconciling users.',
            updatedAt: new Date(),
          },
        });
        return 'retryable';
      }
      const now = new Date();
      const currentVersion = root.current_version_id
        ? await transaction.onboardingJourneyVersion.findUnique({
            where: { id: root.current_version_id },
            select: { id: true, contentHash: true },
          })
        : null;
      if (currentVersion?.contentHash === hashes.contentHash) {
        const prior = await transaction.onboardingRoadmapDerivation.findUnique({
          where: {
            roadmapId_knowledgeSnapshotHash_contentVersionId: {
              roadmapId: root.id,
              knowledgeSnapshotHash: durableJob.knowledgeSnapshotHash,
              contentVersionId: currentVersion.id,
            },
          },
        });
        const derivation =
          prior ??
          (await transaction.onboardingRoadmapDerivation.create({
            data: {
              id: randomUUID(),
              roadmapId: root.id,
              contentVersionId: currentVersion.id,
              refreshJobId: job.id,
              sourceVersionId: durableJob.sourceVersionId,
              knowledgeSnapshotHash: durableJob.knowledgeSnapshotHash,
              artifactKey: durableJob.artifactKey,
              evidenceHash: hashes.evidenceHash,
              inputDescriptor: toJson(durableJob.inputDescriptor),
              provenance: toJson({
                publicationEventId: durableJob.publicationEventId,
                evidenceBundleHash: hashes.evidenceBundleHash,
                equivalentToCurrentContent: true,
              }),
            },
          }));
        if (!prior) {
          await transaction.onboardingRoadmapEvidencePin.create({
            data: {
              id: randomUUID(),
              roadmapId: root.id,
              sourceVersionId: durableJob.sourceVersionId,
              derivationId: derivation.id,
              evidenceBundleHash: hashes.evidenceBundleHash,
            },
          });
        }
        const incompleteRollouts = await transaction.onboardingRoadmapRollout.findMany({
          where: {
            roadmapId: root.id,
            canonicalVersionId: currentVersion.id,
            status: 'partial',
          },
          select: { id: true },
        });
        for (const rollout of incompleteRollouts) {
          const failedUsers = await transaction.onboardingRoadmapUserSync.findMany({
            where: { rolloutId: rollout.id, status: 'failed' },
            select: { userId: true },
          });
          await transaction.onboardingRoadmapUserSync.updateMany({
            where: { rolloutId: rollout.id, status: 'failed' },
            data: {
              status: 'retryable',
              attempt: 0,
              availableAt: now,
              completedAt: null,
              errorCode: null,
              errorMessage: null,
              updatedAt: now,
            },
          });
          if (failedUsers.length) {
            await transaction.onboardingPlan.updateMany({
              where: {
                roadmapId: root.id,
                canonicalOwnerId: { in: failedUsers.map((sync) => sync.userId) },
                desiredVersionId: currentVersion.id,
              },
              data: { syncStatus: 'pending', syncError: null },
            });
          }
          await this.refreshRolloutStatus(transaction, rollout.id, now);
        }
        await transaction.onboardingRoadmap.update({
          where: { id: root.id },
          data: {
            currentDerivationId: derivation.id,
            currentKnowledgeSnapshotHash: durableJob.knowledgeSnapshotHash,
            lastPublishedRefreshSequence: durableJob.refreshSequence,
            suspendedAt: null,
            suspensionReason: null,
            updatedAt: now,
          },
        });
        await transaction.onboardingRoadmapPublicationEvent.create({
          data: {
            id: randomUUID(),
            roadmapId: root.id,
            refreshJobId: job.id,
            priorVersionId: currentVersion.id,
            contentVersionId: currentVersion.id,
            derivationId: derivation.id,
            eventType: 'derivation_equivalent',
            refreshSequence: durableJob.refreshSequence,
            rootRevision: root.revision,
            metadata: toJson({ evidenceBundleHash: hashes.evidenceBundleHash }),
          },
        });
        const terminal = await transaction.onboardingRoadmapRefreshJob.updateMany({
          where: {
            id: job.id,
            status: 'running',
            claimToken: job.claimToken,
            claimedBy: job.claimedBy,
            leaseExpiresAt: { gt: now },
          },
          data: {
            status: 'equivalent',
            completedAt: now,
            leaseExpiresAt: null,
            claimedBy: null,
            updatedAt: now,
          },
        });
        if (terminal.count !== 1) throw new LostStaticRoadmapClaimError();
        return 'equivalent';
      }

      // Only a changed-content rollout replaces a terminal partial rollout. An equivalent
      // derivation creates no replacement cohort, so superseding here would strand unresolved
      // users on their older applied version.
      const partialRollouts = await transaction.onboardingRoadmapRollout.findMany({
        where: { roadmapId: root.id, status: 'partial' },
        select: { id: true },
      });
      if (partialRollouts.length) {
        const partialIds = partialRollouts.map((rollout) => rollout.id);
        await transaction.onboardingRoadmapUserSync.updateMany({
          where: {
            rolloutId: { in: partialIds },
            status: { in: ['pending', 'running', 'retryable', 'failed'] },
          },
          data: {
            status: 'superseded',
            claimedBy: null,
            leaseExpiresAt: null,
            completedAt: now,
            updatedAt: now,
          },
        });
        await transaction.onboardingRoadmapRollout.updateMany({
          where: { id: { in: partialIds }, status: 'partial' },
          data: { status: 'superseded', supersededAt: now, updatedAt: now },
        });
      }

      const versionNumber = root.revision + 1;
      const descriptor = cloneJson(durableJob.inputDescriptor) as unknown as StaticRoadmapInput;
      let legacyPreflight: ReturnType<typeof parseLegacyPreflightContext> = null;
      if (versionNumber === 1) {
        if (
          !descriptor.legacyPreflightAuditEventId ||
          !descriptor.legacyPreflightFingerprint ||
          !Array.isArray(descriptor.legacyQuarantinedOwnerIds)
        ) {
          throw new StaticRoadmapValidationError(
            'Canonical v1 is missing its mandatory legacy integrity preflight.',
          );
        }
        const auditEvent = await transaction.onboardingRoadmapGovernanceEvent.findUnique({
          where: { id: descriptor.legacyPreflightAuditEventId },
          select: {
            roadmapId: true,
            sourceId: true,
            eventType: true,
            decisionStatus: true,
            details: true,
          },
        });
        legacyPreflight = auditEvent
          ? parseLegacyPreflightContext(descriptor.legacyPreflightAuditEventId, auditEvent.details)
          : null;
        if (
          !auditEvent ||
          auditEvent.roadmapId !== root.id ||
          auditEvent.sourceId !== durableJob.sourceId ||
          auditEvent.eventType !== 'legacy_integrity_preflight_completed' ||
          auditEvent.decisionStatus !== 'approved' ||
          legacyPreflight?.fingerprint !== descriptor.legacyPreflightFingerprint ||
          hashCanonical(legacyPreflight.quarantinedOwnerIds) !==
            hashCanonical([...descriptor.legacyQuarantinedOwnerIds].sort())
        ) {
          throw new StaticRoadmapValidationError(
            'Canonical v1 legacy integrity preflight provenance is invalid.',
          );
        }
      }
      const canonicalVersionId = randomUUID();
      if (currentVersion) {
        await transaction.onboardingJourneyVersion.update({
          where: { id: currentVersion.id },
          data: { lifecycleStatus: 'superseded' },
        });
      }
      await transaction.onboardingJourneyVersion.create({
        data: {
          id: canonicalVersionId,
          ownerId: null,
          title: roadmap.title,
          stages: toJson(roadmap.stages),
          sourceReferences: toJson(roadmap.sourceReferences),
          supersedesVersionId: currentVersion?.id,
          changeSource: 'ingestion_refresh',
          createdBy: 'static-roadmap-worker',
          createdAt: now,
          roadmapId: root.id,
          versionNumber,
          lifecycleStatus: 'published',
          contentHash: hashes.contentHash,
          knowledgeSnapshotHash: durableJob.knowledgeSnapshotHash,
          artifactKey: durableJob.artifactKey,
          evidenceHash: hashes.evidenceHash,
          sourceVersionId: durableJob.sourceVersionId,
          inputDescriptor: toJson(durableJob.inputDescriptor),
          provenance: toJson({
            publicationEventId: durableJob.publicationEventId,
            evidenceBundleHash: hashes.evidenceBundleHash,
          }),
          objectiveVersion: durableJob.objectiveVersion,
          retrievalConfigVersion: durableJob.retrievalConfigVersion,
          retrievalQuerySetVersion: durableJob.retrievalQuerySetVersion,
          generatorSchemaVersion: durableJob.generatorSchemaVersion,
          promptVersion: durableJob.promptVersion,
          provider: durableJob.provider,
          model: durableJob.model,
          decodingConfigVersion: durableJob.decodingConfigVersion,
          generationJobId: durableJob.id,
          publishedAt: now,
        },
      });
      const derivation = await transaction.onboardingRoadmapDerivation.create({
        data: {
          id: randomUUID(),
          roadmapId: root.id,
          contentVersionId: canonicalVersionId,
          refreshJobId: job.id,
          sourceVersionId: durableJob.sourceVersionId,
          knowledgeSnapshotHash: durableJob.knowledgeSnapshotHash,
          artifactKey: durableJob.artifactKey,
          evidenceHash: hashes.evidenceHash,
          inputDescriptor: toJson(durableJob.inputDescriptor),
          provenance: toJson({
            publicationEventId: durableJob.publicationEventId,
            evidenceBundleHash: hashes.evidenceBundleHash,
          }),
        },
      });
      const rolloutId = randomUUID();
      const activeUsers = await transaction.user.findMany({
        where: { isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      const users =
        versionNumber === 1
          ? eligibleInitialBackfillUsers(activeUsers, legacyPreflight?.quarantinedOwnerIds ?? [])
          : activeUsers;
      await transaction.onboardingRoadmapRollout.create({
        data: {
          id: rolloutId,
          roadmapId: root.id,
          canonicalVersionId,
          status: users.length ? 'pending' : 'complete',
          initialBootstrap: versionNumber === 1,
          cohortCapturedAt: now,
          targetCount: users.length,
          ...(users.length ? {} : { completedAt: now }),
        },
      });
      if (users.length) {
        await transaction.onboardingRoadmapUserSync.createMany({
          data: users.map((user) => ({
            id: randomUUID(),
            rolloutId,
            roadmapId: root.id,
            userId: user.id,
            targetVersionId: canonicalVersionId,
          })),
          skipDuplicates: true,
        });
        await transaction.onboardingPlan.updateMany({
          where: {
            roadmapId: root.id,
            canonicalOwnerId: { in: users.map((user) => user.id) },
            appliedVersionId: { not: canonicalVersionId },
          },
          data: {
            desiredVersionId: canonicalVersionId,
            syncStatus: 'pending',
            syncError: null,
          },
        });
      }
      const advanced = await transaction.onboardingRoadmap.updateMany({
        where: {
          id: root.id,
          revision: root.revision,
          latestRefreshSequence: durableJob.refreshSequence,
          currentVersionId: root.current_version_id,
        },
        data: {
          currentVersionId: canonicalVersionId,
          currentDerivationId: derivation.id,
          revision: versionNumber,
          currentKnowledgeSnapshotHash: durableJob.knowledgeSnapshotHash,
          lastPublishedRefreshSequence: durableJob.refreshSequence,
          suspendedAt: null,
          suspensionReason: null,
          updatedAt: now,
        },
      });
      if (advanced.count !== 1) throw new LostStaticRoadmapClaimError();
      await transaction.onboardingRoadmapPublicationEvent.create({
        data: {
          id: randomUUID(),
          roadmapId: root.id,
          refreshJobId: job.id,
          priorVersionId: currentVersion?.id,
          contentVersionId: canonicalVersionId,
          derivationId: derivation.id,
          eventType: 'content_published',
          refreshSequence: durableJob.refreshSequence,
          rootRevision: versionNumber,
          metadata: toJson({
            targetUsers: users.length,
            quarantinedOwners:
              versionNumber === 1 ? (legacyPreflight?.quarantinedOwnerIds.length ?? 0) : 0,
            legacyPreflightAuditEventId: legacyPreflight?.auditEventId ?? null,
            evidenceBundleHash: hashes.evidenceBundleHash,
          }),
        },
      });
      const terminal = await transaction.onboardingRoadmapRefreshJob.updateMany({
        where: {
          id: job.id,
          status: 'running',
          claimToken: job.claimToken,
          claimedBy: job.claimedBy,
          leaseExpiresAt: { gt: new Date() },
        },
        data: {
          status: 'published',
          completedAt: now,
          leaseExpiresAt: null,
          claimedBy: null,
          updatedAt: now,
        },
      });
      if (terminal.count !== 1) throw new LostStaticRoadmapClaimError();
      await transaction.onboardingRoadmapEvidencePin.createMany({
        data: [
          {
            id: randomUUID(),
            roadmapId: root.id,
            sourceVersionId: durableJob.sourceVersionId,
            canonicalVersionId,
            evidenceBundleHash: hashes.evidenceBundleHash,
          },
          {
            id: randomUUID(),
            roadmapId: root.id,
            sourceVersionId: durableJob.sourceVersionId,
            derivationId: derivation.id,
            evidenceBundleHash: hashes.evidenceBundleHash,
          },
        ],
      });
      return 'published';
    });
  }

  async failRefresh(job: ClaimedRefreshJob, error: unknown): Promise<'retryable' | 'failed'> {
    if (error instanceof LostStaticRoadmapClaimError) throw error;
    const retryable =
      error instanceof RetryableStaticRoadmapError && job.attempt < this.config.maxRefreshAttempts;
    const status = retryable ? 'retryable' : 'failed';
    const message = safeMessage(error);
    const availableAt = new Date(
      Date.now() + this.config.retryBaseMs * 2 ** Math.max(0, job.attempt - 1),
    );
    const failed = await this.db.onboardingRoadmapRefreshJob.updateMany({
      where: {
        id: job.id,
        status: 'running',
        claimToken: job.claimToken,
        claimedBy: job.claimedBy,
        leaseExpiresAt: { gt: new Date() },
      },
      data: {
        status,
        ...(retryable ? { availableAt } : { completedAt: new Date() }),
        leaseExpiresAt: null,
        claimedBy: null,
        errorCode: errorCode(error),
        errorMessage: message,
        updatedAt: new Date(),
      },
    });
    if (failed.count !== 1) throw new LostStaticRoadmapClaimError();
    return status;
  }

  private async deferRefresh(job: ClaimedRefreshJob, code: string, message: string): Promise<void> {
    const deferred = await this.db.onboardingRoadmapRefreshJob.updateMany({
      where: {
        id: job.id,
        status: 'running',
        claimToken: job.claimToken,
        claimedBy: job.claimedBy,
        leaseExpiresAt: { gt: new Date() },
      },
      data: {
        status: 'retryable',
        availableAt: new Date(Date.now() + this.config.retryBaseMs),
        leaseExpiresAt: null,
        claimedBy: null,
        errorCode: code,
        errorMessage: message,
        updatedAt: new Date(),
      },
    });
    if (deferred.count !== 1) throw new LostStaticRoadmapClaimError();
  }

  async assertRefreshAuthorized(job: ClaimedRefreshJob): Promise<void> {
    this.assertCapturedWorkerConfig(job);
    const now = new Date();
    const [source, durableJob] = await Promise.all([
      this.db.knowledgeSource.findUnique({
        where: { id: job.input.sourceId },
        select: { enabled: true, accessScope: true, currentVersionId: true },
      }),
      this.db.onboardingRoadmapRefreshJob.findUnique({
        where: { id: job.id },
        select: { status: true, claimToken: true, claimedBy: true, leaseExpiresAt: true },
      }),
    ]);
    if (
      !source?.enabled ||
      source.accessScope !== 'all_users' ||
      source.currentVersionId !== job.input.sourceVersionId ||
      durableJob?.status !== 'running' ||
      durableJob.claimToken !== job.claimToken ||
      durableJob.claimedBy !== job.claimedBy ||
      !durableJob.leaseExpiresAt ||
      durableJob.leaseExpiresAt <= now
    ) {
      throw new StaticRoadmapValidationError(
        'The captured evidence was revoked or the refresh claim expired before generation.',
      );
    }
  }

  private assertCapturedWorkerConfig(job: ClaimedRefreshJob): void {
    const input = job.input;
    const current = this.config;
    const matches =
      input.sourceId === current.authoritativeSourceId &&
      input.embeddingProfileId === current.embeddingProfileId &&
      input.retrievalConfigVersion === current.retrievalConfigVersion &&
      input.retrievalQuerySetVersion === current.retrievalQuerySetVersion &&
      input.objectiveVersion === current.objectiveVersion &&
      input.generatorSchemaVersion === current.generatorSchemaVersion &&
      input.promptVersion === current.promptVersion &&
      input.provider === current.provider &&
      input.model === current.model &&
      input.decodingConfigVersion === current.decodingConfigVersion;
    if (!matches) {
      throw new StaticRoadmapValidationError(
        'The refresh input descriptor does not match the current worker implementation. Replay with a new operator request ID.',
      );
    }
  }

  async getForUser(ownerId: string): Promise<StaticRoadmapView> {
    return this.db.$transaction(
      async (transaction) => {
        const root = await transaction.onboardingRoadmap.findUnique({
          where: { key: DEFAULT_STATIC_ROADMAP_KEY },
          select: { id: true, suspendedAt: true, currentVersionId: true },
        });
        if (!root || root.suspendedAt) return structuredClone(STATIC_ROADMAP_EMPTY_STATE);
        const plans = await transaction.onboardingPlan.findMany({
          where: { canonicalOwnerId: ownerId, roadmapId: root.id },
          include: { taskInstances: { where: { retiredAt: null } } },
          orderBy: { createdAt: 'asc' },
          take: 2,
        });
        if (plans.length > 1) return structuredClone(STATIC_ROADMAP_EMPTY_STATE);
        const plan = plans[0];
        if (root.currentVersionId && plan?.appliedVersionId !== root.currentVersionId) {
          const [user, version] = await Promise.all([
            transaction.user.findUnique({
              where: { id: ownerId },
              select: { isActive: true },
            }),
            transaction.onboardingJourneyVersion.findUnique({
              where: { id: root.currentVersionId },
              select: { sourceVersionId: true, versionNumber: true, inputDescriptor: true },
            }),
          ]);
          const currentInput = version
            ? (cloneJson(version.inputDescriptor) as unknown as Partial<StaticRoadmapInput>)
            : null;
          const ownerIsQuarantinedFromV1 =
            version?.versionNumber === 1 &&
            Array.isArray(currentInput?.legacyQuarantinedOwnerIds) &&
            currentInput.legacyQuarantinedOwnerIds.includes(ownerId);
          const sourceVersion = version?.sourceVersionId
            ? await transaction.knowledgeSourceVersion.findUnique({
                where: { id: version.sourceVersionId },
                select: { sourceId: true },
              })
            : null;
          const source =
            sourceVersion?.sourceId === this.config.authoritativeSourceId
              ? await transaction.knowledgeSource.findUnique({
                  where: { id: this.config.authoritativeSourceId },
                  select: { enabled: true, accessScope: true },
                })
              : null;
          let ownerQuarantineResolved = !ownerIsQuarantinedFromV1;
          if (
            ownerIsQuarantinedFromV1 &&
            user?.isActive &&
            version &&
            source?.enabled &&
            source.accessScope === 'all_users' &&
            typeof currentInput?.legacyPreflightAuditEventId === 'string' &&
            typeof currentInput.legacyPreflightFingerprint === 'string'
          ) {
            const resolution = await resolveLegacyOwnerQuarantine(transaction, {
              roadmapId: root.id,
              sourceId: this.config.authoritativeSourceId,
              canonicalVersionId: root.currentVersionId,
              ownerId,
              baselineAuditEventId: currentInput.legacyPreflightAuditEventId,
              baselineFingerprint: currentInput.legacyPreflightFingerprint,
            });
            ownerQuarantineResolved = resolution.kind === 'resolved';
          }
          if (
            user?.isActive &&
            ownerQuarantineResolved &&
            source?.enabled &&
            source.accessScope === 'all_users'
          ) {
            await transaction.$executeRaw(Prisma.sql`
            insert into onboarding_roadmap_user_syncs
              (id, rollout_id, roadmap_id, user_id, target_version_id, initial_account)
            values
              (${randomUUID()}::uuid, null, ${root.id}::uuid, ${ownerId}::uuid,
               ${root.currentVersionId}::uuid, true)
            on conflict (user_id, target_version_id) do nothing`);
            await transaction.onboardingRoadmapUserSync.updateMany({
              where: {
                userId: ownerId,
                targetVersionId: root.currentVersionId,
                status: { in: ['failed', 'superseded'] },
              },
              data: {
                status: 'retryable',
                availableAt: new Date(),
                completedAt: null,
                errorCode: null,
                errorMessage: null,
                updatedAt: new Date(),
              },
            });
            if (plan) {
              await transaction.onboardingPlan.updateMany({
                where: {
                  id: plan.id,
                  roadmapId: root.id,
                  canonicalOwnerId: ownerId,
                  appliedVersionId: { not: root.currentVersionId },
                },
                data: {
                  desiredVersionId: root.currentVersionId,
                  syncStatus: 'pending',
                  syncError: null,
                },
              });
            }
          }
        }
        if (!plan?.appliedVersionId) {
          return structuredClone(STATIC_ROADMAP_EMPTY_STATE);
        }
        const version = await transaction.onboardingJourneyVersion.findUnique({
          where: { id: plan.appliedVersionId },
          select: {
            id: true,
            roadmapId: true,
            versionNumber: true,
            title: true,
            stages: true,
            sourceReferences: true,
            inputDescriptor: true,
          },
        });
        if (version?.roadmapId !== root.id || version.versionNumber === null) {
          return structuredClone(STATIC_ROADMAP_EMPTY_STATE);
        }
        const stages = cloneJson(version.stages) as unknown as CanonicalStaticRoadmapStage[];
        const canonicalIdentity = new Map(
          stages.flatMap((stage) => stage.tasks.map((task) => [task.id, task.stableKey] as const)),
        );
        const taskRows = plan.taskInstances.filter(
          (task) =>
            task.canonicalItemId && canonicalIdentity.get(task.canonicalItemId) === task.stableKey,
        );
        if (taskRows.some((task) => !isValidRoadmapTaskStatus(task.status))) {
          return structuredClone(STATIC_ROADMAP_EMPTY_STATE);
        }
        const tasks: UserRoadmapTaskState[] = taskRows.map(toUserTaskState);
        const taskByItem = new Map(tasks.map((task) => [task.canonicalItemId, task] as const));
        const progress = calculateProgress(stages, taskByItem);
        const upcomingTasks = tasks
          .filter((task) => task.status !== 'completed' && task.status !== 'waived')
          .sort((left, right) => {
            if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt);
            if (left.dueAt) return -1;
            if (right.dueAt) return 1;
            return left.stableKey.localeCompare(right.stableKey);
          })
          .slice(0, 5);
        const unreadNotices = await transaction.$queryRaw<
          Array<{
            id: string;
            canonicalVersionId: string;
            retainedCount: number;
            addedCount: number;
            retiredCount: number;
            completedPreservedCount: number;
            createdAt: Date;
            readAt: Date | null;
          }>
        >(Prisma.sql`
      select notices.id,
             notices.canonical_version_id as "canonicalVersionId",
             notices.retained_count as "retainedCount",
             notices.added_count as "addedCount",
             notices.retired_count as "retiredCount",
             notices.completed_preserved_count as "completedPreservedCount",
             notices.created_at as "createdAt",
             notices.read_at as "readAt"
        from onboarding_roadmap_update_notices notices
        join onboarding_journey_versions notice_versions
          on notice_versions.id = notices.canonical_version_id
       where notices.user_id = ${ownerId}::uuid
         and notices.roadmap_id = ${version.roadmapId}::uuid
         and notices.read_at is null
         and notice_versions.version_number <= ${version.versionNumber}
       order by notices.created_at desc`);
        const newestUnreadNotice = unreadNotices[0]
          ? await this.toNotice(transaction, unreadNotices[0], ownerId)
          : null;
        return {
          status: 'ready',
          roadmap: {
            roadmapId: version.roadmapId,
            versionId: version.id,
            versionNumber: version.versionNumber,
            title: version.title,
            stages: stages.map(toSharedStage),
            sourceReferences: cloneJson(version.sourceReferences) as unknown as SourceReference[],
          },
          userState: {
            appliedVersionId: plan.appliedVersionId,
            stateRevision: plan.stateRevision,
            syncStatus:
              plan.syncStatus === 'pending' || plan.syncStatus === 'failed'
                ? plan.syncStatus
                : 'current',
            progress,
            tasks,
            upcomingTasks,
          },
          newestUnreadNotice,
          unreadNoticeCount: unreadNotices.length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async transitionTask(
    ownerId: string,
    taskId: string,
    input: StaticTaskTransitionInput,
  ): Promise<StaticTaskTransitionResult> {
    const requestHash = hashCanonical({ taskId, ...input });
    let internal:
      | Exclude<StaticTaskTransitionResult, { kind: 'conflict'; latest: StaticRoadmapView }>
      | { kind: 'conflict' };
    try {
      internal = await this.db.$transaction(async (transaction) => {
        const plans = await transaction.onboardingPlan.findMany({
          where: { canonicalOwnerId: ownerId, roadmapId: { not: null } },
          select: { id: true, stateRevision: true, appliedVersionId: true },
          orderBy: { createdAt: 'asc' },
          take: 2,
        });
        if (plans.length > 1) return { kind: 'not_found' as const };
        const plan = plans[0];
        if (!plan?.appliedVersionId) return { kind: 'not_found' as const };
        const duplicate = await transaction.onboardingTaskEvent.findFirst({
          where: { planId: plan.id, idempotencyKey: input.clientRequestId },
        });
        if (duplicate) {
          if (duplicate.requestHash !== requestHash || !duplicate.response) {
            return { kind: 'conflict' as const };
          }
          const response = cloneJson(duplicate.response) as unknown as {
            task: UserRoadmapTaskState;
            taskRevision: number;
            stateRevision: number;
          };
          return {
            kind: 'replay' as const,
            ...response,
          };
        }
        const task = await transaction.onboardingTaskInstance.findFirst({
          where: { id: taskId, planId: plan.id, retiredAt: null },
        });
        if (!task?.canonicalItemId) return { kind: 'not_found' as const };
        const appliedVersion = await transaction.onboardingJourneyVersion.findUnique({
          where: { id: plan.appliedVersionId },
          select: { stages: true },
        });
        const appliedTask = appliedVersion
          ? (cloneJson(appliedVersion.stages) as unknown as CanonicalStaticRoadmapStage[])
              .flatMap((stage) => stage.tasks)
              .find((item) => item.id === task.canonicalItemId)
          : undefined;
        if (!appliedTask || appliedTask.stableKey !== task.stableKey) {
          return { kind: 'not_found' as const };
        }
        if (
          task.revision !== input.expectedTaskRevision ||
          plan.stateRevision !== input.expectedStateRevision ||
          !canTransition(task.status as OnboardingTaskStatus, input.status)
        ) {
          return { kind: 'conflict' as const };
        }
        if (input.status === 'in_progress' || input.status === 'completed') {
          const dependencyConflict = await this.hasUnsatisfiedDependency(
            transaction,
            plan.appliedVersionId,
            plan.id,
            task.canonicalItemId,
          );
          if (dependencyConflict) return { kind: 'conflict' as const };
        }
        const changedAt = new Date();
        const updatedTask = await transaction.onboardingTaskInstance.updateMany({
          where: {
            id: task.id,
            planId: plan.id,
            revision: input.expectedTaskRevision,
            retiredAt: null,
          },
          data: {
            status: input.status,
            revision: { increment: 1 },
            completedAt: input.status === 'completed' ? changedAt : null,
            completedBy: input.status === 'completed' ? ownerId : null,
          },
        });
        if (updatedTask.count !== 1) return { kind: 'conflict' as const };
        const updatedState = await transaction.onboardingPlan.updateMany({
          where: {
            id: plan.id,
            canonicalOwnerId: ownerId,
            stateRevision: input.expectedStateRevision,
          },
          data: { stateRevision: { increment: 1 } },
        });
        if (updatedState.count !== 1)
          throw new LostStaticRoadmapClaimError('Task transition CAS lost.');
        const resultTask = await transaction.onboardingTaskInstance.findUnique({
          where: { id: task.id },
        });
        if (!resultTask?.canonicalItemId) throw new LostStaticRoadmapClaimError();
        const response = {
          task: toUserTaskState(resultTask),
          taskRevision: resultTask.revision,
          stateRevision: plan.stateRevision + 1,
        };
        await transaction.onboardingTaskEvent.create({
          data: {
            id: randomUUID(),
            planId: plan.id,
            taskId: task.id,
            actorId: ownerId,
            fromStatus: task.status,
            toStatus: input.status,
            source: 'tasks_ui',
            idempotencyKey: input.clientRequestId,
            taskRevision: response.taskRevision,
            planRevision: response.stateRevision,
            requestHash,
            response: toJson(response),
            createdAt: changedAt,
          },
        });
        return { kind: 'updated' as const, ...response };
      });
    } catch (error) {
      if (error instanceof LostStaticRoadmapClaimError) {
        internal = { kind: 'conflict' };
      } else if (isUniqueConstraintError(error)) {
        const replay = await this.db.onboardingTaskEvent.findFirst({
          where: {
            plan: { canonicalOwnerId: ownerId },
            idempotencyKey: input.clientRequestId,
          },
          select: { requestHash: true, response: true },
        });
        if (replay?.requestHash === requestHash && replay.response) {
          const response = cloneJson(replay.response) as unknown as {
            task: UserRoadmapTaskState;
            taskRevision: number;
            stateRevision: number;
          };
          return { kind: 'replay', ...response };
        }
        internal = { kind: 'conflict' };
      } else {
        throw error;
      }
    }
    if (internal.kind === 'conflict') {
      return { kind: 'conflict', latest: await this.getForUser(ownerId) };
    }
    return internal;
  }

  async acknowledgeNotice(
    ownerId: string,
    noticeId: string,
  ): Promise<StaticNoticeAcknowledgementResult> {
    return this.db.$transaction(async (transaction) => {
      const target = await transaction.$queryRaw<
        Array<{ roadmap_id: string; version_number: number }>
      >(Prisma.sql`
        select notices.roadmap_id, versions.version_number
          from onboarding_roadmap_update_notices notices
          join onboarding_journey_versions versions
            on versions.id = notices.canonical_version_id
         where notices.id = ${noticeId}::uuid
           and notices.user_id = ${ownerId}::uuid
         limit 1
         for update of notices`);
      if (!target[0]) return { kind: 'not_found' as const };
      await transaction.$executeRaw(Prisma.sql`
        update onboarding_roadmap_update_notices notices
           set read_at = coalesce(notices.read_at, now())
          from onboarding_journey_versions versions
         where notices.canonical_version_id = versions.id
           and notices.user_id = ${ownerId}::uuid
           and notices.roadmap_id = ${target[0].roadmap_id}::uuid
           and versions.version_number <= ${target[0].version_number}`);
      return { kind: 'acknowledged' as const };
    });
  }

  async resolveEvidenceForUser(
    ownerId: string,
    evidenceId: string,
  ): Promise<StaticRoadmapEvidence | null> {
    return this.db.$transaction(
      async (transaction) => {
        const plans = await transaction.onboardingPlan.findMany({
          where: { canonicalOwnerId: ownerId, roadmapId: { not: null } },
          select: { roadmapId: true, appliedVersionId: true },
          orderBy: { createdAt: 'asc' },
          take: 2,
        });
        const plan = plans.length === 1 ? plans[0] : undefined;
        if (!plan?.roadmapId || !plan.appliedVersionId) return null;
        const [root, version, source] = await Promise.all([
          transaction.onboardingRoadmap.findUnique({
            where: { id: plan.roadmapId },
            select: { suspendedAt: true },
          }),
          transaction.onboardingJourneyVersion.findUnique({
            where: { id: plan.appliedVersionId },
            select: {
              roadmapId: true,
              generationJobId: true,
              sourceVersionId: true,
              evidenceHash: true,
              sourceReferences: true,
            },
          }),
          transaction.knowledgeSource.findUnique({
            where: { id: this.config.authoritativeSourceId },
            select: { enabled: true, accessScope: true },
          }),
        ]);
        if (
          !root ||
          root.suspendedAt ||
          !source?.enabled ||
          source.accessScope !== 'all_users' ||
          version?.roadmapId !== plan.roadmapId ||
          !version.sourceVersionId ||
          !version.generationJobId
        ) {
          return null;
        }
        const authorized = (
          cloneJson(version.sourceReferences) as unknown as SourceReference[]
        ).some((reference) => reference.id === evidenceId);
        if (!authorized) return null;
        const [sourceVersion, job, pin] = await Promise.all([
          transaction.knowledgeSourceVersion.findUnique({
            where: { id: version.sourceVersionId },
            select: { sourceId: true },
          }),
          transaction.onboardingRoadmapRefreshJob.findUnique({
            where: { id: version.generationJobId },
            select: {
              sourceId: true,
              sourceVersionId: true,
              evidenceBundle: true,
              evidenceBundleHash: true,
            },
          }),
          transaction.onboardingRoadmapEvidencePin.findFirst({
            where: {
              canonicalVersionId: plan.appliedVersionId,
              sourceVersionId: version.sourceVersionId,
            },
            select: { evidenceBundleHash: true },
          }),
        ]);
        if (
          sourceVersion?.sourceId !== this.config.authoritativeSourceId ||
          job?.sourceId !== this.config.authoritativeSourceId ||
          job.sourceVersionId !== version.sourceVersionId ||
          !job.evidenceBundleHash ||
          pin?.evidenceBundleHash !== job.evidenceBundleHash
        ) {
          return null;
        }
        const evidenceBundle = cloneJson(
          job.evidenceBundle ?? [],
        ) as unknown as StaticRoadmapEvidence[];
        if (
          hashEvidenceBundle(evidenceBundle) !== job.evidenceBundleHash ||
          version.evidenceHash !== job.evidenceBundleHash
        ) {
          return null;
        }
        const evidence = evidenceBundle.find((item) => item.id === evidenceId);
        if (
          !evidence ||
          evidence.sourceId !== this.config.authoritativeSourceId ||
          evidence.sourceVersionId !== version.sourceVersionId
        ) {
          return null;
        }
        return evidence;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async toNotice(
    database: Prisma.TransactionClient,
    row: {
      id: string;
      canonicalVersionId: string;
      retainedCount: number;
      addedCount: number;
      retiredCount: number;
      completedPreservedCount: number;
      createdAt: Date;
      readAt: Date | null;
    },
    ownerId: string,
  ): Promise<RoadmapUpdateNotice | null> {
    const version = await database.onboardingJourneyVersion.findUnique({
      where: { id: row.canonicalVersionId },
      select: { versionNumber: true, inputDescriptor: true },
    });
    if (version?.versionNumber === null || version?.versionNumber === undefined) return null;
    const descriptor = cloneJson(version.inputDescriptor ?? {}) as Partial<StaticRoadmapInput>;
    return {
      id: row.id,
      userId: ownerId,
      roadmapVersionId: row.canonicalVersionId,
      roadmapVersionNumber: version.versionNumber,
      ingestionRunId: descriptor.ingestionRunId ?? null,
      retainedItemCount: row.retainedCount,
      addedItemCount: row.addedCount,
      retiredItemCount: row.retiredCount,
      preservedCompletedCount: row.completedPreservedCount,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    };
  }

  private async hasUnsatisfiedDependency(
    transaction: Prisma.TransactionClient,
    versionId: string,
    planId: string,
    canonicalItemId: string,
  ): Promise<boolean> {
    const version = await transaction.onboardingJourneyVersion.findUnique({
      where: { id: versionId },
      select: { stages: true },
    });
    if (!version) return true;
    const stages = cloneJson(version.stages) as unknown as CanonicalStaticRoadmapStage[];
    const stage = stages.find((candidate) =>
      candidate.tasks.some((task) => task.id === canonicalItemId),
    );
    const task = stage?.tasks.find((candidate) => candidate.id === canonicalItemId);
    if (!stage || !task) return true;
    const taskRows = await transaction.onboardingTaskInstance.findMany({
      where: { planId, retiredAt: null },
      select: { canonicalItemId: true, status: true },
    });
    const statusByItem = new Map(taskRows.map((row) => [row.canonicalItemId, row.status] as const));
    const taskByKey = new Map(
      stages.flatMap((item) => item.tasks.map((row) => [row.stableKey, row])),
    );
    for (const dependencyKey of task.dependsOnTaskKeys) {
      const dependency = taskByKey.get(dependencyKey);
      const status = dependency ? statusByItem.get(dependency.id) : undefined;
      if (status !== 'completed' && status !== 'waived') return true;
    }
    const stageByKey = new Map(stages.map((item) => [item.stableKey, item] as const));
    for (const dependencyKey of stage.dependsOnStageKeys) {
      const dependency = stageByKey.get(dependencyKey);
      if (!dependency) return true;
      const required = dependency.tasks.filter((item) => item.required);
      const completionTasks = required.length ? required : dependency.tasks;
      if (
        !completionTasks.length ||
        completionTasks.some((item) => {
          const status = statusByItem.get(item.id);
          return status !== 'completed' && status !== 'waived';
        })
      ) {
        return true;
      }
    }
    return false;
  }

  async processUserSyncBatch(
    workerId: string,
    limit = this.config.userSyncBatchSize,
  ): Promise<{
    processed: number;
    applied: number;
    retryable: number;
    failed: number;
    superseded: number;
  }> {
    const totals = { processed: 0, applied: 0, retryable: 0, failed: 0, superseded: 0 };
    while (totals.processed < limit) {
      const sync = await this.claimNextUserSync(workerId);
      if (!sync) break;
      totals.processed += 1;
      try {
        const status = await this.applyUserSync(sync, workerId);
        totals[status] += 1;
      } catch (error) {
        const status = await this.failUserSync(sync, workerId, error);
        totals[status] += 1;
      }
    }
    return totals;
  }

  private async claimNextUserSync(workerId: string): Promise<ClaimedUserSync | null> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + this.config.leaseMs);
    return this.db.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        select syncs.id
          from onboarding_roadmap_user_syncs syncs
          left join onboarding_roadmap_rollouts rollouts on rollouts.id = syncs.rollout_id
         where (
           (syncs.initial_account = true and syncs.rollout_id is null)
           or rollouts.status in ('pending', 'running', 'partial')
         )
           and (
             (syncs.status in ('pending', 'retryable') and syncs.available_at <= ${now})
             or (syncs.status = 'running' and syncs.lease_expires_at < ${now})
           )
         order by rollouts.created_at, syncs.user_id
         for update of syncs skip locked
         limit 1`);
      if (!rows[0]) return null;
      const current = await transaction.onboardingRoadmapUserSync.findUnique({
        where: { id: rows[0].id },
      });
      if (!current) return null;
      const claimed = await transaction.onboardingRoadmapUserSync.update({
        where: { id: current.id },
        data: {
          status: 'running',
          attempt: { increment: 1 },
          claimToken: { increment: 1 },
          claimedBy: workerId,
          leaseExpiresAt,
          startedAt: current.startedAt ?? now,
          errorCode: null,
          errorMessage: null,
          updatedAt: now,
        },
      });
      if (claimed.rolloutId) {
        await transaction.onboardingRoadmapRollout.updateMany({
          where: { id: claimed.rolloutId, status: 'pending' },
          data: { status: 'running', startedAt: now, updatedAt: now },
        });
      }
      return {
        id: claimed.id,
        rolloutId: claimed.rolloutId,
        roadmapId: claimed.roadmapId,
        userId: claimed.userId,
        targetVersionId: claimed.targetVersionId,
        claimToken: claimed.claimToken,
        attempt: claimed.attempt,
        initialAccount: claimed.initialAccount,
      };
    });
  }

  private async applyUserSync(
    sync: ClaimedUserSync,
    workerId: string,
  ): Promise<'applied' | 'superseded'> {
    return this.db.$transaction(async (transaction) => {
      const now = new Date();
      const locked = await transaction.$queryRaw<
        Array<{
          id: string;
          status: string;
          claim_token: number;
          claimed_by: string | null;
          lease_expires_at: Date | null;
        }>
      >(Prisma.sql`
        select id, status, claim_token, claimed_by, lease_expires_at
          from onboarding_roadmap_user_syncs
         where id = ${sync.id}::uuid
         for update`);
      const durable = locked[0];
      if (
        !durable ||
        durable.status !== 'running' ||
        durable.claim_token !== sync.claimToken ||
        durable.claimed_by !== workerId ||
        !durable.lease_expires_at ||
        durable.lease_expires_at <= now
      ) {
        throw new LostStaticRoadmapClaimError('User sync claim expired.');
      }
      const root = await transaction.onboardingRoadmap.findUnique({
        where: { id: sync.roadmapId },
        select: { currentVersionId: true, suspendedAt: true },
      });
      const user = await transaction.user.findUnique({
        where: { id: sync.userId },
        select: { id: true, isActive: true },
      });
      const disposition = capturedUserSyncDisposition({
        roadmapExists: Boolean(root),
        roadmapSuspended: Boolean(root?.suspendedAt),
        targetIsCurrent: root?.currentVersionId === sync.targetVersionId,
        recipientExists: Boolean(user),
        recipientIsActive: user?.isActive ?? false,
      });
      if (disposition === 'supersede') {
        await transaction.onboardingRoadmapUserSync.update({
          where: { id: sync.id },
          data: {
            status: 'superseded',
            completedAt: now,
            leaseExpiresAt: null,
            claimedBy: null,
            updatedAt: now,
          },
        });
        if (sync.rolloutId) await this.refreshRolloutStatus(transaction, sync.rolloutId, now);
        return 'superseded';
      }
      if (disposition === 'integrity_error' || !user) {
        throw new StaticRoadmapValidationError(
          'The captured roadmap recipient no longer resolves to a user record.',
        );
      }
      const version = await transaction.onboardingJourneyVersion.findUnique({
        where: { id: sync.targetVersionId },
        select: { id: true, title: true, stages: true, versionNumber: true },
      });
      const rollout = sync.rolloutId
        ? await transaction.onboardingRoadmapRollout.findUnique({
            where: { id: sync.rolloutId },
            select: { initialBootstrap: true },
          })
        : null;
      if (!version || version.versionNumber === null || (sync.rolloutId && !rollout)) {
        throw new StaticRoadmapValidationError('The user sync target is not canonical.');
      }
      const targetStages = cloneJson(version.stages) as unknown as CanonicalStaticRoadmapStage[];
      const canonicalStates = await transaction.onboardingPlan.findMany({
        where: { canonicalOwnerId: sync.userId, roadmapId: sync.roadmapId },
        include: { taskInstances: true, definitionVersion: true },
        orderBy: { createdAt: 'asc' },
        take: 2,
      });
      if (canonicalStates.length > 1) {
        throw new StaticRoadmapValidationError(
          'Duplicate canonical user roadmap states require integrity quarantine.',
        );
      }
      let state = canonicalStates[0];
      if (state?.appliedVersionId === sync.targetVersionId && state.syncStatus === 'current') {
        await transaction.onboardingRoadmapUserSync.update({
          where: { id: sync.id },
          data: {
            userStateId: state.id,
            status: 'applied',
            completedAt: now,
            leaseExpiresAt: null,
            claimedBy: null,
            updatedAt: now,
          },
        });
        if (sync.rolloutId) await this.refreshRolloutStatus(transaction, sync.rolloutId, now);
        return 'applied';
      }
      if (!state) {
        const legacyStates = await transaction.onboardingPlan.findMany({
          where: { ownerId: sync.userId, status: 'active', roadmapId: null },
          include: { taskInstances: true, definitionVersion: true },
          orderBy: { createdAt: 'asc' },
          take: 2,
        });
        if (legacyStates.length > 1) {
          throw new StaticRoadmapValidationError(
            'Duplicate active legacy plans require integrity quarantine.',
          );
        }
        state = legacyStates[0];
      }
      const hadCanonicalApplied = Boolean(state?.roadmapId && state.appliedVersionId);
      if (!state) {
        const stateId = randomUUID();
        const created = await transaction.onboardingPlan.create({
          data: {
            id: stateId,
            sessionId: null,
            ownerId: sync.userId,
            definitionVersionId: version.id,
            creationRequestId: `static-roadmap:${sync.roadmapId}`,
            title: version.title,
            status: 'active',
            startAt: now,
            revision: 0,
            createdAt: now,
            startedAt: now,
            roadmapId: sync.roadmapId,
            canonicalOwnerId: sync.userId,
            appliedVersionId: version.id,
            desiredVersionId: version.id,
            stateRevision: 0,
            syncStatus: 'pending',
            firstAppliedAt: now,
          },
          include: { taskInstances: true, definitionVersion: true },
        });
        state = created;
      }
      const baseStateRevision = state.stateRevision;
      const activeRows = state.taskInstances;
      if (activeRows.some((task) => !isValidRoadmapTaskStatus(task.status))) {
        throw new StaticRoadmapValidationError(
          'A legacy roadmap task has an invalid status and requires integrity quarantine.',
        );
      }
      const byStableKey = new Map<string, typeof activeRows>();
      for (const row of activeRows) {
        const entries = byStableKey.get(row.stableKey) ?? [];
        entries.push(row);
        byStableKey.set(row.stableKey, entries);
      }
      if (
        [...byStableKey.values()].some((rows) => rows.filter((row) => !row.retiredAt).length > 1)
      ) {
        throw new StaticRoadmapValidationError(
          'Duplicate active legacy task keys require integrity quarantine.',
        );
      }
      const legacySemanticsByDefinitionId = semanticsByLegacyDefinition(
        state.definitionVersion.stages,
      );
      const retainedIds = new Set<string>();
      const retiredIds = new Set<string>();
      const events: Array<{
        taskInstanceId?: string;
        stableKey?: string;
        eventType:
          | 'item_added'
          | 'item_retained'
          | 'item_retired'
          | 'item_due_date_changed'
          | 'version_applied';
        metadata: Prisma.InputJsonValue;
      }> = [];
      let retainedCount = 0;
      let addedCount = 0;
      let retiredCount = 0;
      let dueDateChangedCount = 0;
      let completedPreservedCount = 0;

      for (const stage of targetStages) {
        for (const task of stage.tasks) {
          const matches = byStableKey.get(task.stableKey) ?? [];
          const matchingSemantics = matches.filter(
            (match) =>
              (match.semanticsHash ?? legacySemanticsByDefinitionId.get(match.definitionId)) ===
              task.semanticsHash,
          );
          const activeMatches = matches.filter((match) => !match.retiredAt);
          const semanticCandidate =
            matchingSemantics.length === 1 ? matchingSemantics[0]! : undefined;
          const candidate =
            semanticCandidate &&
            (activeMatches.length === 0 ||
              (activeMatches.length === 1 && activeMatches[0]!.id === semanticCandidate.id))
              ? semanticCandidate
              : undefined;
          const candidateSemantics = candidate
            ? (candidate.semanticsHash ?? legacySemanticsByDefinitionId.get(candidate.definitionId))
            : undefined;
          if (candidate && candidateSemantics === task.semanticsHash) {
            retainedIds.add(candidate.id);
            retainedCount += 1;
            if (candidate.status === 'completed') completedPreservedCount += 1;
            const dueAt = dueDate(state.startAt, task.dueOffsetDays);
            const dueChanged = dateValue(candidate.dueAt) !== dateValue(dueAt);
            await transaction.onboardingTaskInstance.update({
              where: { id: candidate.id },
              data: {
                definitionId: task.id,
                canonicalItemId: task.id,
                stageId: stage.id,
                dueAt,
                appliedVersionId: version.id,
                semanticsHash: task.semanticsHash,
                semanticsHashVersion: task.semanticsHashVersion,
                introducedVersionId: candidate.introducedVersionId ?? version.id,
                lastAppliedVersionId: version.id,
                retiredAt: null,
                retiredReason: null,
                retiredVersionId: null,
              },
            });
            events.push({
              taskInstanceId: candidate.id,
              stableKey: task.stableKey,
              eventType: 'item_retained',
              metadata: toJson({ statusPreserved: candidate.status }),
            });
            if (dueChanged) {
              dueDateChangedCount += 1;
              events.push({
                taskInstanceId: candidate.id,
                stableKey: task.stableKey,
                eventType: 'item_due_date_changed',
                metadata: toJson({
                  from: candidate.dueAt?.toISOString() ?? null,
                  to: dueAt?.toISOString() ?? null,
                }),
              });
            }
            continue;
          }
          const activeCanonicalMismatch = matches.find(
            (match) =>
              !match.retiredAt &&
              match.canonicalItemId &&
              (match.semanticsHash ?? legacySemanticsByDefinitionId.get(match.definitionId)) !==
                task.semanticsHash,
          );
          if (activeCanonicalMismatch) {
            throw new StaticRoadmapValidationError(
              `Canonical task ${task.stableKey} has incompatible stored semantics.`,
            );
          }
          for (const ambiguous of matches) {
            if (retainedIds.has(ambiguous.id) || ambiguous.retiredAt) continue;
            await transaction.onboardingTaskInstance.update({
              where: { id: ambiguous.id },
              data: {
                retiredAt: now,
                retiredReason: 'static_roadmap_replaced',
                retiredVersionId: version.id,
              },
            });
            retiredIds.add(ambiguous.id);
            retiredCount += 1;
            events.push({
              taskInstanceId: ambiguous.id,
              stableKey: ambiguous.stableKey,
              eventType: 'item_retired',
              metadata: toJson({
                reason: matches.length > 1 ? 'ambiguous_legacy_match' : 'semantics_changed',
              }),
            });
          }
          const taskInstanceId = randomUUID();
          await transaction.onboardingTaskInstance.create({
            data: {
              id: taskInstanceId,
              planId: state.id,
              definitionId: task.id,
              stableKey: task.stableKey,
              stageId: stage.id,
              status: 'not_started',
              dueAt: dueDate(state.startAt, task.dueOffsetDays),
              revision: 0,
              canonicalItemId: task.id,
              appliedVersionId: version.id,
              semanticsHash: task.semanticsHash,
              semanticsHashVersion: task.semanticsHashVersion,
              introducedVersionId: version.id,
              lastAppliedVersionId: version.id,
            },
          });
          retainedIds.add(taskInstanceId);
          addedCount += 1;
          events.push({
            taskInstanceId,
            stableKey: task.stableKey,
            eventType: 'item_added',
            metadata: toJson({ status: 'not_started' }),
          });
        }
      }
      for (const row of activeRows) {
        if (retainedIds.has(row.id) || retiredIds.has(row.id) || row.retiredAt) continue;
        await transaction.onboardingTaskInstance.update({
          where: { id: row.id },
          data: {
            retiredAt: now,
            retiredReason: 'static_roadmap_removed',
            retiredVersionId: version.id,
          },
        });
        retiredCount += 1;
        events.push({
          taskInstanceId: row.id,
          stableKey: row.stableKey,
          eventType: 'item_retired',
          metadata: toJson({ reason: 'not_in_target_version' }),
        });
      }
      const nextRevision = baseStateRevision + 1;
      const advanced = await transaction.onboardingPlan.updateMany({
        where: { id: state.id, stateRevision: baseStateRevision },
        data: {
          roadmapId: sync.roadmapId,
          canonicalOwnerId: sync.userId,
          appliedVersionId: version.id,
          desiredVersionId: version.id,
          stateRevision: nextRevision,
          syncStatus: 'current',
          firstAppliedAt: state.firstAppliedAt ?? now,
          syncedAt: now,
          syncError: null,
        },
      });
      if (advanced.count !== 1) throw new RetryableStaticRoadmapError('User state CAS lost.');
      await transaction.onboardingAiProposal.updateMany({
        where: { planId: state.id, status: 'pending' },
        data: { status: 'dismissed' },
      });
      events.push({
        eventType: 'version_applied',
        metadata: toJson({ versionNumber: version.versionNumber }),
      });
      await transaction.onboardingRoadmapReconciliationEvent.createMany({
        data: events.map((event) => ({
          id: randomUUID(),
          roadmapId: sync.roadmapId,
          userStateId: state!.id,
          userSyncId: sync.id,
          targetVersionId: version.id,
          taskInstanceId: event.taskInstanceId,
          stableKey: event.stableKey,
          eventType: event.eventType,
          metadata: event.metadata,
          stateRevision: nextRevision,
          createdAt: now,
        })),
      });
      const committed = await transaction.onboardingRoadmapUserSync.updateMany({
        where: {
          id: sync.id,
          status: 'running',
          claimToken: sync.claimToken,
          claimedBy: workerId,
          leaseExpiresAt: { gt: now },
        },
        data: {
          userStateId: state.id,
          status: 'applied',
          retainedCount,
          addedCount,
          retiredCount,
          dueDateChangedCount,
          completedPreservedCount,
          completedAt: now,
          leaseExpiresAt: null,
          claimedBy: null,
          updatedAt: now,
        },
      });
      if (committed.count !== 1) throw new LostStaticRoadmapClaimError('User sync lease expired.');
      if (
        shouldCreateRoadmapUpdateNotice({
          hadCanonicalApplied,
          recipientIsActive: user.isActive,
          initialAccount: sync.initialAccount,
          initialBootstrap: rollout?.initialBootstrap ?? false,
          hasRollout: Boolean(rollout && sync.rolloutId),
        }) &&
        sync.rolloutId
      ) {
        await transaction.onboardingRoadmapUpdateNotice.upsert({
          where: {
            userId_canonicalVersionId: {
              userId: sync.userId,
              canonicalVersionId: version.id,
            },
          },
          create: {
            id: randomUUID(),
            roadmapId: sync.roadmapId,
            userId: sync.userId,
            canonicalVersionId: version.id,
            rolloutId: sync.rolloutId,
            retainedCount,
            addedCount,
            retiredCount,
            completedPreservedCount,
          },
          update: {},
        });
      }
      if (sync.rolloutId) await this.refreshRolloutStatus(transaction, sync.rolloutId, now);
      return 'applied';
    });
  }

  private async failUserSync(
    sync: ClaimedUserSync,
    workerId: string,
    error: unknown,
  ): Promise<'retryable' | 'failed'> {
    if (error instanceof LostStaticRoadmapClaimError) throw error;
    const retryable =
      !(error instanceof StaticRoadmapValidationError) &&
      sync.attempt < this.config.maxUserSyncAttempts;
    const status = retryable ? 'retryable' : 'failed';
    const now = new Date();
    await this.db.$transaction(async (transaction) => {
      const failed = await transaction.onboardingRoadmapUserSync.updateMany({
        where: {
          id: sync.id,
          status: 'running',
          claimToken: sync.claimToken,
          claimedBy: workerId,
          leaseExpiresAt: { gt: now },
        },
        data: {
          status,
          ...(retryable
            ? {
                availableAt: new Date(
                  now.getTime() + this.config.retryBaseMs * 2 ** Math.max(0, sync.attempt - 1),
                ),
              }
            : { completedAt: now }),
          leaseExpiresAt: null,
          claimedBy: null,
          errorCode: errorCode(error),
          errorMessage: safeMessage(error),
          updatedAt: now,
        },
      });
      if (failed.count !== 1) {
        throw new LostStaticRoadmapClaimError('User sync lease expired before failure commit.');
      }
      await transaction.onboardingPlan.updateMany({
        where: {
          canonicalOwnerId: sync.userId,
          roadmapId: sync.roadmapId,
          desiredVersionId: sync.targetVersionId,
        },
        data: {
          syncStatus: status === 'failed' ? 'failed' : 'pending',
          syncError: safeMessage(error),
        },
      });
      if (sync.rolloutId) await this.refreshRolloutStatus(transaction, sync.rolloutId, now);
    });
    return status;
  }

  private async refreshRolloutStatus(
    transaction: Prisma.TransactionClient,
    rolloutId: string,
    now: Date,
  ): Promise<void> {
    const [rollout, appliedCount, failedCount, unresolvedCount] = await Promise.all([
      transaction.onboardingRoadmapRollout.findUnique({
        where: { id: rolloutId },
        select: { targetCount: true },
      }),
      transaction.onboardingRoadmapUserSync.count({
        where: { rolloutId, status: 'applied' },
      }),
      transaction.onboardingRoadmapUserSync.count({ where: { rolloutId, status: 'failed' } }),
      transaction.onboardingRoadmapUserSync.count({
        where: { rolloutId, status: { in: ['pending', 'running', 'retryable'] } },
      }),
    ]);
    if (!rollout) return;
    const complete = unresolvedCount === 0 && failedCount === 0;
    await transaction.onboardingRoadmapRollout.update({
      where: { id: rolloutId },
      data: {
        appliedCount,
        failedCount,
        status: complete ? 'complete' : failedCount > 0 ? 'partial' : 'running',
        ...(complete ? { completedAt: now } : {}),
        updatedAt: now,
      },
    });
  }
}

export class RetryableStaticRoadmapError extends Error {
  readonly retryable = true;

  constructor(message: string) {
    super(message);
    this.name = 'RetryableStaticRoadmapError';
  }
}

export class LostStaticRoadmapClaimError extends Error {
  constructor(message = 'The static roadmap worker no longer owns this claim.') {
    super(message);
    this.name = 'LostStaticRoadmapClaimError';
  }
}

function toSharedStage(stage: CanonicalStaticRoadmapStage): StaticRoadmapStage {
  return {
    id: stage.id,
    stableKey: stage.stableKey,
    position: stage.position,
    title: stage.title,
    description: stage.description,
    dependsOnStageKeys: stage.dependsOnStageKeys,
    tasks: stage.tasks.map((task) => ({
      id: task.id,
      stableKey: task.stableKey,
      position: task.position,
      title: task.title,
      ...(task.description ? { description: task.description } : {}),
      completionCriteria: task.completionCriteria,
      required: task.required,
      countsTowardProgress: task.countsTowardProgress,
      weight: task.weight,
      ...(task.dueOffsetDays !== undefined ? { dueOffsetDays: task.dueOffsetDays } : {}),
      dependsOnTaskKeys: task.dependsOnTaskKeys,
    })),
  };
}

function toUserTaskState(task: {
  id: string;
  canonicalItemId: string | null;
  stableKey: string;
  status: string;
  revision: number;
  dueAt: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
}): UserRoadmapTaskState {
  if (!task.canonicalItemId) throw new Error('Canonical task state is missing its item ID.');
  return {
    taskInstanceId: task.id,
    canonicalItemId: task.canonicalItemId,
    stableKey: task.stableKey,
    status: task.status as OnboardingTaskStatus,
    taskRevision: task.revision,
    ...(task.dueAt ? { dueAt: task.dueAt.toISOString() } : {}),
    ...(task.completedAt ? { completedAt: task.completedAt.toISOString() } : {}),
    ...(task.completedBy ? { completedBy: task.completedBy } : {}),
  };
}

function calculateProgress(
  stages: CanonicalStaticRoadmapStage[],
  stateByItem: ReadonlyMap<string, UserRoadmapTaskState>,
): OnboardingProgress {
  const definitions = stages.flatMap((stage) => stage.tasks);
  const applicable = definitions.filter((definition) => {
    const state = stateByItem.get(definition.id);
    return definition.countsTowardProgress && state?.status !== 'waived';
  });
  const completed = applicable.filter(
    (definition) => stateByItem.get(definition.id)?.status === 'completed',
  );
  const completedWeight = completed.reduce((total, definition) => total + definition.weight, 0);
  const totalWeight = applicable.reduce((total, definition) => total + definition.weight, 0);
  const completedStageKeys = new Set(
    stages
      .filter((stage) => {
        const required = stage.tasks.filter((task) => task.required);
        const completion = required.length ? required : stage.tasks;
        return (
          completion.length > 0 &&
          completion.every((task) => {
            const status = stateByItem.get(task.id)?.status;
            return status === 'completed' || status === 'waived';
          })
        );
      })
      .map((stage) => stage.stableKey),
  );
  const currentStage = stages
    .slice()
    .sort((left, right) => left.position - right.position)
    .find(
      (stage) =>
        !completedStageKeys.has(stage.stableKey) &&
        stage.dependsOnStageKeys.every((key) => completedStageKeys.has(key)),
    );
  return {
    percentComplete: totalWeight ? Math.round((completedWeight / totalWeight) * 100) : null,
    completedWeight,
    totalWeight,
    completedTaskCount: completed.length,
    totalTaskCount: applicable.length,
    currentStageId: currentStage?.id ?? null,
  };
}

function semanticsByLegacyDefinition(value: unknown): Map<string, string> {
  const result = new Map<string, string>();
  if (!Array.isArray(value)) return result;
  for (const stage of value) {
    if (!stage || typeof stage !== 'object') continue;
    const tasks = (stage as { tasks?: unknown }).tasks;
    if (!Array.isArray(tasks)) continue;
    for (const task of tasks) {
      if (!task || typeof task !== 'object') continue;
      const row = task as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.completionCriteria !== 'string') continue;
      result.set(
        row.id,
        hashTaskSemantics({
          completionCriteria: row.completionCriteria,
          required: row.required !== false,
          countsTowardProgress: row.countsTowardProgress !== false,
          weight: typeof row.weight === 'number' ? row.weight : 1,
          dependsOnTaskKeys: Array.isArray(row.dependsOnTaskKeys)
            ? row.dependsOnTaskKeys.filter((item): item is string => typeof item === 'string')
            : [],
        }),
      );
    }
  }
  return result;
}

function canTransition(from: OnboardingTaskStatus, to: OnboardingTaskStatus): boolean {
  const allowed: Record<OnboardingTaskStatus, OnboardingTaskStatus[]> = {
    not_started: ['in_progress', 'blocked', 'completed'],
    in_progress: ['not_started', 'blocked', 'completed'],
    blocked: ['in_progress', 'completed'],
    completed: [],
    waived: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

function dueDate(anchor: Date, offsetDays: number | undefined): Date | null {
  if (offsetDays === undefined) return null;
  const result = new Date(anchor);
  result.setUTCDate(result.getUTCDate() + offsetDays);
  return result;
}

function dateValue(value: Date | null): number | null {
  return value?.getTime() ?? null;
}

function cloneJson<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function errorCode(error: unknown): string {
  if (error instanceof StaticRoadmapValidationError) return 'VALIDATION_FAILED';
  if (error instanceof RetryableStaticRoadmapError) return 'RETRYABLE_UPSTREAM';
  return 'UNEXPECTED_ERROR';
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, ' ').slice(0, 1_000);
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
