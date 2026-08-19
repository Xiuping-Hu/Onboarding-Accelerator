import type {
  OnboardingTaskStatus,
  SourceReference,
  StaticRoadmapStage,
  TransitionOnboardingTaskRequest,
  UserRoadmapTaskState,
  WorkspaceOnboardingState,
} from '@onboarding/shared';

export const DEFAULT_STATIC_ROADMAP_KEY = 'default';
export const STATIC_ROADMAP_EMPTY_STATE: WorkspaceOnboardingState = {
  status: 'empty',
  message: 'Roadmap is being prepared from the latest knowledge base.',
  newestUnreadNotice: null,
  unreadNoticeCount: 0,
};

export type StaticRoadmapView = WorkspaceOnboardingState;
export type StaticTaskTransitionInput = TransitionOnboardingTaskRequest;

export type StaticTaskTransitionResult =
  | {
      kind: 'updated' | 'replay';
      task: UserRoadmapTaskState;
      taskRevision: number;
      stateRevision: number;
    }
  | { kind: 'conflict'; latest: StaticRoadmapView }
  | { kind: 'not_found' };

export type StaticNoticeAcknowledgementResult = { kind: 'acknowledged' } | { kind: 'not_found' };

export interface StaticRoadmapConfig {
  enabled: boolean;
  refreshClaimsEnabled: boolean;
  authoritativeSourceId: string;
  embeddingProfileId: string;
  retrievalLimitPerQuery: number;
  userSyncBatchSize: number;
  maxRefreshAttempts: number;
  maxUserSyncAttempts: number;
  leaseMs: number;
  retryBaseMs: number;
  objectiveVersion: string;
  retrievalConfigVersion: string;
  retrievalQuerySetVersion: string;
  generatorSchemaVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  decodingConfigVersion: string;
}

export interface StaticRoadmapInput {
  publicationEventId: string;
  ingestionRunId: string | null;
  refreshSequence: string;
  sourceId: string;
  sourceVersionId: string;
  sourceManifestHash: string;
  accessScope: 'all_users';
  embeddingProfileId: string;
  retrievalConfigVersion: string;
  retrievalQuerySetVersion: string;
  objectiveVersion: string;
  generatorSchemaVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  decodingConfigVersion: string;
  lineageBaseCanonicalVersionId: string | null;
  lineageBaseContentHash: string | null;
  legacyPreflightAuditEventId: string | null;
  legacyPreflightFingerprint: string | null;
  legacyQuarantinedOwnerIds: string[];
}

export interface StaticRoadmapEvidence {
  id: string;
  chunkId: string;
  sourceId: string;
  sourceVersionId: string;
  embeddingProfileId: string;
  sectionKey?: string;
  title: string;
  excerpt: string;
  uri?: string;
  queryIndex: number;
  rank: number;
  score: number;
}

export interface CanonicalStaticRoadmapTask {
  id: string;
  stableKey: string;
  position: number;
  title: string;
  description?: string;
  completionCriteria: string;
  required: boolean;
  countsTowardProgress: boolean;
  weight: number;
  dueOffsetDays?: number;
  dependsOnTaskKeys: string[];
  semanticsHash: string;
  semanticsHashVersion: string;
  sourceReferenceIds: string[];
}

export interface CanonicalStaticRoadmapStage {
  id: string;
  stableKey: string;
  position: number;
  title: string;
  description: string;
  dependsOnStageKeys: string[];
  tasks: CanonicalStaticRoadmapTask[];
}

export interface CanonicalStaticRoadmap {
  title: string;
  summary?: string;
  stages: CanonicalStaticRoadmapStage[];
  sourceReferences: SourceReference[];
  assumptions: string[];
  warnings: string[];
}

export interface GeneratedStaticRoadmapTask {
  stableKey: string;
  title: string;
  description?: string;
  completionCriteria: string;
  required?: boolean;
  countsTowardProgress?: boolean;
  weight?: number;
  dueOffsetDays?: number;
  dependsOnTaskKeys?: string[];
  sourceReferenceIds: string[];
}

export interface GeneratedStaticRoadmapStage {
  stableKey: string;
  title: string;
  description: string;
  position: number;
  dependsOnStageKeys?: string[];
  tasks: GeneratedStaticRoadmapTask[];
}

export interface GeneratedStaticRoadmap {
  title: string;
  summary?: string;
  stages: GeneratedStaticRoadmapStage[];
  assumptions?: string[];
  warnings?: string[];
  sourceReferences: string[];
}

export interface ClaimedRefreshJob {
  id: string;
  roadmapId: string;
  claimToken: number;
  claimedBy: string;
  leaseExpiresAt: Date;
  attempt: number;
  refreshSequence: bigint;
  input: StaticRoadmapInput;
  knowledgeSnapshotHash: string;
  artifactKey: string;
  evidenceBundle?: StaticRoadmapEvidence[];
}

export interface StaticRoadmapProcessResult {
  processed: boolean;
  jobId?: string;
  status?: 'published' | 'equivalent' | 'stale' | 'retryable' | 'failed';
  error?: string;
}

export interface StaticRoadmapUserSyncProcessResult {
  processed: number;
  applied: number;
  retryable: number;
  failed: number;
  superseded: number;
}

export interface BootstrapStaticRoadmapInput {
  requestId: string;
}

export type EnqueueStaticRoadmapResult =
  | {
      kind: 'enqueued';
      jobId: string;
      refreshSequence: string;
    }
  | {
      kind: 'duplicate';
      jobId: string;
      refreshSequence: string;
      jobStatus:
        | 'queued'
        | 'running'
        | 'retryable'
        | 'published'
        | 'equivalent'
        | 'stale'
        | 'failed'
        | 'cancelled';
    }
  | { kind: 'ignored' }
  | {
      kind: 'waiting_for_source';
      reason: 'authoritative_source_missing' | 'authoritative_source_not_published';
    };

export type { OnboardingTaskStatus, StaticRoadmapStage, UserRoadmapTaskState };
