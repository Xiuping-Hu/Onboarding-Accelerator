export interface AskRequest {
  question: string;
  userId?: string;
  conversationId?: string;
  webSearchEnabled?: boolean;
}

export type SourceType = 'knowledge_base' | 'web';
export type LegacySourceKind = 'knowledge-base' | 'web';

export interface SourceProvenance {
  id: string;
  title: string;
  excerpt: string;
  uri?: string;
  href?: string;
  sourceType?: SourceType;
  kind?: LegacySourceKind;
  score?: number;
  confidence?: number;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export type KnowledgeSource = SourceProvenance;

export interface CitationSegment {
  markdown: string;
  sourceIds: string[];
}

export interface AskResponse {
  answer: string;
  sources: SourceProvenance[];
  citationSegments?: CitationSegment[];
  usage?: AiUsageStats;
}

export interface HealthResponse {
  status: 'ok';
  service: string;
}

export interface AccountUser {
  id: string;
  email?: string;
  displayName?: string;
  role?: string;
  tenantId?: string;
}

export type AccountRole = 'user' | 'admin';

export interface CurrentUserResponse {
  user: AccountUser;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface RoadmapNodeReference {
  nodeId: string;
  title: string;
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sources?: SourceProvenance[];
  citationSegments?: CitationSegment[];
  sourceLinkStatus?: 'unavailable';
  guideNodeIds?: string[];
  focusStepIds?: string[];
  roadmapReferences?: RoadmapNodeReference[];
  usage?: AiUsageStats;
}

export interface UserSettings {
  webSearchEnabled: boolean;
}

export interface GuideNode {
  id: string;
  parentId?: string;
  title: string;
  summary: string;
  detail?: string;
  children: string[];
  depth: number;
  status: 'generated' | 'expanded';
  sources: SourceProvenance[];
  canExpand: boolean;
  maxDepth: number;
  createdAt: string;
  updatedAt: string;
}

export interface GuideGraphState {
  rootNodeIds: string[];
  nodes: Record<string, GuideNode>;
  selectedNodeId?: string;
  expandedNodeIds: string[];
  knowledgeMapId?: string;
  knowledgeMapVersionId?: string;
  projectedKnowledgeMapNodeIds?: string[];
}

export interface OnboardingSession {
  id: string;
  revision?: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  settings: UserSettings;
  chatHistory: ChatMessage[];
  guide: GuideGraphState;
}

export interface SessionSummary extends OnboardingSession {
  chatMessageCount: number;
  guideNodeCount: number;
}

export interface ListSessionsResponse {
  sessions: OnboardingSession[];
}

export interface CreateSessionRequest {
  title?: string;
  settings?: Partial<UserSettings>;
}

export interface CreateSessionResponse {
  session: OnboardingSession;
}

export interface UpdateSessionRequest {
  title?: string;
  settings?: Partial<UserSettings>;
  selectedNodeId?: string | null;
  expandedNodeIds?: string[];
}

export type GetSessionResponse = OnboardingSession;
export type UpdateSessionResponse = OnboardingSession;

export type GuideStepStatus = 'locked' | 'ready' | 'in-progress' | 'complete';

export interface GuideStep {
  id: string;
  title: string;
  summary: string;
  status: GuideStepStatus;
  depth: number;
  parentId?: string;
  detail?: string;
  childIds: string[];
  sourceIds?: string[];
  canExpand?: boolean;
  maxDepth?: number;
  childCount?: number;
  hasChildren?: boolean;
}

export interface GuideEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface GuideGraph {
  rootId: string;
  steps: GuideStep[];
  edges: GuideEdge[];
  sources: KnowledgeSource[];
  emptyReason?: 'not_created';
}

export interface GuideRequest {
  sessionId: string;
  webSearchEnabled: boolean;
}

export interface GuideResponse {
  graph: GuideGraph;
  focusStepId?: string;
  knowledgeMapEnabled?: boolean;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  webSearchEnabled: boolean;
  referencedNodeId?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  session?: OnboardingSession;
  sources: SourceProvenance[];
  guideNodeIds?: string[];
  focusStepIds?: string[];
  usage?: AiUsageStats;
}

export interface GenerateGuideRootRequest {
  prompt?: string;
  webSearchEnabled?: boolean;
}

export interface GenerateGuideRootResponse {
  rootNodeIds: string[];
  nodes: GuideNode[];
  session: OnboardingSession;
  sources: SourceProvenance[];
  knowledgeMapEnabled?: boolean;
}

export type OnboardingPlanStatus = 'active' | 'completed' | 'cancelled';

export type OnboardingTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'waived';

export type OnboardingTaskMutationSource =
  | 'tasks_ui'
  | 'overview_ui'
  | 'agent_confirmed'
  | 'roadmap_edit';

export type RoadmapStageProjectionStatus =
  | 'completed'
  | 'in-progress'
  | 'upcoming'
  | 'overdue'
  | 'status-unavailable';

export interface OnboardingTaskDefinitionInput {
  stableKey: string;
  title: string;
  description?: string;
  completionCriteria?: string;
  required?: boolean;
  countsTowardProgress?: boolean;
  weight?: number;
  dueOffsetDays?: number;
  dependsOnTaskKeys?: string[];
}

export interface RoadmapStageDefinitionInput {
  stableKey: string;
  title: string;
  description: string;
  position: number;
  guideStepId?: string;
  dependsOnStageKeys?: string[];
  tasks: OnboardingTaskDefinitionInput[];
}

export interface CreateOnboardingPlanRequest {
  clientRequestId: string;
  title: string;
  definitionVersionId?: string;
  startAt?: string;
  targetAt?: string;
  stages: RoadmapStageDefinitionInput[];
}

export interface GenerateOnboardingPlanRequest {
  clientRequestId: string;
  goal: string;
  role?: string;
  title?: string;
  startAt?: string;
  targetAt?: string;
}

export type RoadmapCommand =
  | {
      type: 'set_metadata';
      title?: string;
      startAt?: string;
      targetAt?: string | null;
    }
  | {
      type: 'add_stage';
      stage: Omit<RoadmapStageDefinitionInput, 'position'> & { position?: number };
      afterStageKey?: string;
    }
  | {
      type: 'update_stage';
      stageKey: string;
      patch: Partial<
        Pick<
          RoadmapStageDefinitionInput,
          'title' | 'description' | 'guideStepId' | 'dependsOnStageKeys'
        >
      >;
    }
  | { type: 'move_stage'; stageKey: string; afterStageKey?: string }
  | { type: 'delete_stage'; stageKey: string }
  | {
      type: 'add_task';
      stageKey: string;
      task: OnboardingTaskDefinitionInput;
      afterTaskKey?: string;
    }
  | {
      type: 'update_task';
      taskKey: string;
      patch: Partial<Omit<OnboardingTaskDefinitionInput, 'stableKey'>>;
    }
  | {
      type: 'move_task';
      taskKey: string;
      toStageKey: string;
      afterTaskKey?: string;
    }
  | { type: 'delete_task'; taskKey: string };

export interface RoadmapCommandRequest {
  expectedPlanRevision: number;
  idempotencyKey: string;
  command: RoadmapCommand;
  destructiveImpactHash?: string;
}

export interface RoadmapChangeImpact {
  tasksAdded: number;
  tasksRetired: number;
  completedTasksRetained: number;
  completedTasksReset: number;
  destructive: boolean;
  impactHash?: string;
}

export interface RoadmapCommandImpactResponse {
  impact: RoadmapChangeImpact;
}

export interface RequestRoadmapAiProposal {
  instruction: string;
  selectedStageKey?: string;
  selectedTaskKey?: string;
}

export interface RoadmapChangeProposal {
  id: string;
  planId: string;
  basePlanRevision: number;
  baseContentHash: string;
  proposalHash: string;
  operations: RoadmapCommand[];
  rationale: string;
  assumptions: string[];
  warnings: string[];
  progressImpact: RoadmapChangeImpact;
  sourceReferences: string[];
  expiresAt: string;
}

export interface ApplyRoadmapAiProposalRequest {
  expectedPlanRevision: number;
  proposalHash: string;
  idempotencyKey: string;
  destructiveImpactHash?: string;
}

export interface OnboardingPlanRevisionEvent {
  id: string;
  planId: string;
  planRevision: number;
  commandType: string;
  actorId: string;
  fromDefinitionVersionId?: string;
  toDefinitionVersionId: string;
  impact: RoadmapChangeImpact;
  createdAt: string;
}

export interface OnboardingPlanHistoryResponse {
  events: OnboardingPlanRevisionEvent[];
}

export interface OnboardingCancellationImpact {
  planId: string;
  planRevision: number;
  incompleteTaskCount: number;
  completedTaskCount: number;
  impactHash: string;
}

export interface CancelOnboardingPlanRequest {
  expectedPlanRevision: number;
  idempotencyKey: string;
  impactHash: string;
  reason: string;
}

export interface OnboardingTaskProjection {
  id: string;
  planId: string;
  stageId: string;
  stableKey: string;
  title: string;
  description?: string;
  completionCriteria?: string;
  status: OnboardingTaskStatus;
  required: boolean;
  countsTowardProgress: boolean;
  weight: number;
  dueOffsetDays?: number;
  dependsOnTaskKeys: string[];
  dueAt?: string;
  completedAt?: string;
  revision: number;
  overdue: boolean;
}

export interface RoadmapStageProjection {
  id: string;
  stableKey: string;
  position: number;
  title: string;
  description: string;
  status: RoadmapStageProjectionStatus;
  guideStepId?: string;
  dependsOnStageKeys: string[];
  dueAt?: string;
  completedAt?: string;
  completedTaskCount: number;
  totalTaskCount: number;
}

export interface WorkspaceOnboardingProjection {
  planId: string;
  planRevision: number;
  planStatus: OnboardingPlanStatus;
  definitionVersionId: string;
  title: string;
  startAt: string;
  targetAt?: string;
  startedAt: string;
  calculatedAt: string;
  progress: {
    percentComplete: number | null;
    completedWeight: number;
    totalWeight: number;
    completedTaskCount: number;
    totalTaskCount: number;
    currentStageId: string | null;
  };
  roadmap: RoadmapStageProjection[];
  tasks: OnboardingTaskProjection[];
  upcomingTasks: OnboardingTaskProjection[];
}

/**
 * @deprecated Compatibility shape for the retired session-owned onboarding service.
 * New browser code must use WorkspaceOnboardingState.
 */
export type LegacyWorkspaceOnboardingState =
  | { status: 'empty'; reason: 'no-active-plan' }
  | { status: 'ready'; projection: WorkspaceOnboardingProjection };

export interface StaticRoadmapTask {
  id: string;
  stableKey: string;
  position: number;
  title: string;
  description?: string;
  completionCriteria?: string;
  required: boolean;
  countsTowardProgress: boolean;
  weight: number;
  dueOffsetDays?: number;
  dependsOnTaskKeys: string[];
}

export interface StaticRoadmapStage {
  id: string;
  stableKey: string;
  position: number;
  title: string;
  description: string;
  dependsOnStageKeys: string[];
  tasks: StaticRoadmapTask[];
}

export interface SourceReference {
  id: string;
  title: string;
  excerpt?: string;
  href: string;
  sourceType?: SourceType;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface OnboardingProgress {
  percentComplete: number | null;
  completedWeight: number;
  totalWeight: number;
  completedTaskCount: number;
  totalTaskCount: number;
  currentStageId: string | null;
}

export interface UserRoadmapTaskState {
  taskInstanceId: string;
  canonicalItemId: string;
  stableKey: string;
  status: OnboardingTaskStatus;
  taskRevision: number;
  dueAt?: string;
  completedAt?: string;
  completedBy?: string;
}

export interface RoadmapUpdateNotice {
  id: string;
  userId: string;
  roadmapVersionId: string;
  roadmapVersionNumber: number;
  ingestionRunId: string | null;
  retainedItemCount: number;
  addedItemCount: number;
  retiredItemCount: number;
  preservedCompletedCount: number;
  createdAt: string;
  readAt: string | null;
}

export type WorkspaceOnboardingState =
  | {
      status: 'empty';
      message: 'Roadmap is being prepared from the latest knowledge base.';
      newestUnreadNotice: null;
      unreadNoticeCount: 0;
    }
  | {
      status: 'ready';
      roadmap: {
        roadmapId: string;
        versionId: string;
        versionNumber: number;
        title: string;
        stages: StaticRoadmapStage[];
        sourceReferences: SourceReference[];
      };
      userState: {
        appliedVersionId: string;
        stateRevision: number;
        syncStatus: 'current' | 'pending' | 'failed';
        progress: OnboardingProgress;
        tasks: UserRoadmapTaskState[];
        upcomingTasks: UserRoadmapTaskState[];
      };
      newestUnreadNotice: RoadmapUpdateNotice | null;
      unreadNoticeCount: number;
    };

export interface TransitionOnboardingTaskRequest {
  status: OnboardingTaskStatus;
  expectedTaskRevision: number;
  expectedStateRevision: number;
  clientRequestId: string;
}

export interface TransitionOnboardingTaskResponse {
  task: UserRoadmapTaskState;
  taskRevision: number;
  stateRevision: number;
}

/** @deprecated Retired session-owned roadmap mutation response. */
export interface MutateOnboardingRoadmapResponse {
  state: LegacyWorkspaceOnboardingState;
  idempotentReplay: boolean;
  impact: RoadmapChangeImpact;
  revisionEvent?: OnboardingPlanRevisionEvent;
}

export interface AiUsageStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AiUsageModelSummary extends AiUsageStats {
  requests: number;
}

export interface AiUsageSummary extends AiUsageStats {
  requests: number;
  byModel: Record<string, AiUsageModelSummary>;
}

export interface LogSummaryResponse {
  eventsTotal: number;
  requestsTotal: number;
  errorsTotal: number;
  aiUsage: AiUsageSummary;
  lastEventAt?: string;
}

export type LogEventLevel = 'info' | 'error';
export type LogEventType = 'request' | 'ai_usage' | 'error';
export type AiUsageOperation = 'ask' | 'chat';

export interface LogEventRecord {
  id: string;
  timestamp: string;
  level: LogEventLevel;
  type: LogEventType;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  userId?: string;
  operation?: AiUsageOperation;
  sessionId?: string;
  message?: string;
  usage?: AiUsageStats;
}

export interface LogEventsResponse {
  events: LogEventRecord[];
}

export type KnowledgeMapNodeKind =
  | 'concept'
  | 'role'
  | 'system'
  | 'workflow'
  | 'task'
  | 'decision'
  | 'resource'
  | 'milestone';

export type KnowledgeMapRelationship =
  | 'contains'
  | 'prerequisite'
  | 'learning_precedes'
  | 'workflow_transition'
  | 'uses'
  | 'owned_by'
  | 'related';

export type KnowledgeEvidenceHealth =
  | 'current'
  | 'stale'
  | 'missing'
  | 'conflicting'
  | 'needs_review';

export interface KnowledgeEvidenceBinding {
  sourceId: string;
  sourceVersionId?: string;
  sectionKey?: string;
  role: 'authoritative' | 'supplemental';
}

export interface KnowledgeMapDraftNode {
  clientKey: string;
  suggestedStableKey: string;
  kind: KnowledgeMapNodeKind;
  title: string;
  summary: string;
  owner?: string;
  evidence: KnowledgeEvidenceBinding[];
}

export interface KnowledgeMapDraftEdge {
  clientKey: string;
  fromClientKey: string;
  toClientKey: string;
  relationship: KnowledgeMapRelationship;
  rationale?: string;
  evidence: KnowledgeEvidenceBinding[];
}

export interface RagKnowledgeMapDraft {
  objective: string;
  nodes: KnowledgeMapDraftNode[];
  edges: KnowledgeMapDraftEdge[];
}

export type RagWorkflowStatus = 'running' | 'suspended' | 'failed' | 'completed';
export type RagWorkflowPartition = 'refinement' | 'plan' | 'run' | 'complete';

export interface StartRagWorkflowRequest {
  message: string;
  referencedNodeId?: string;
  webSearchEnabled?: boolean;
  clientRequestId: string;
}

export interface ResumeRagWorkflowRequest {
  step: 'refinement-checkpoint' | 'plan-checkpoint';
  clarification?: string;
  approved?: boolean;
}

export interface CorrectRagWorkflowRequest {
  phaseId: string;
  reason: string;
}

export interface RagWorkflowPlanSummary {
  revision: number;
  goal: string;
  approach: string;
  how: string;
  why: string;
  phases: Array<{
    phaseId: string;
    title: string;
    status: 'pending' | 'completed' | 'failed';
  }>;
}

export interface RagWorkflowAuditEventDto {
  id: string;
  eventType: string;
  partition?: string;
  stepId?: string;
  phaseId?: string;
  planRevision?: number;
  reasonCode?: string;
  eventAt: string;
  metadata: Record<string, unknown>;
}

export interface RagWorkflowResponse {
  runId: string;
  status: RagWorkflowStatus;
  currentPartition: RagWorkflowPartition;
  plan?: RagWorkflowPlanSummary;
  result?: {
    summary: string;
    completedPhaseIds: string[];
    evidenceRefs: string[];
    corrections: number;
  };
  suspension?: {
    step: string;
    reasonCode: string;
    questions: string[];
  };
  safeErrorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RagWorkflowEventsResponse {
  events: RagWorkflowAuditEventDto[];
}

export interface KnowledgeMapNodeDetail {
  id: string;
  stableKey: string;
  kind: KnowledgeMapNodeKind;
  title: string;
  summary: string;
  owner?: string;
  controllingDocumentRequired: boolean;
  evidenceHealth: KnowledgeEvidenceHealth;
  sources: SourceProvenance[];
}

export interface PublishedKnowledgeMap {
  id: string;
  versionId: string;
  versionNumber: number;
  title: string;
  description?: string;
  nodes: KnowledgeMapNodeDetail[];
  edges: Array<{
    id: string;
    from: string;
    to: string;
    relationship: KnowledgeMapRelationship;
    rationale?: string;
  }>;
}
