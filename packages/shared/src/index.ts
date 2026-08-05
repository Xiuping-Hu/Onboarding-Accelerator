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

export type OnboardingPlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export type OnboardingTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'waived';

export type OnboardingTaskMutationSource = 'tasks_ui' | 'overview_ui' | 'agent_confirmed';

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

export interface ActivateOnboardingPlanRequest {
  approved: true;
  clientRequestId: string;
  title: string;
  definitionVersionId?: string;
  startAt?: string;
  targetAt?: string;
  stages: RoadmapStageDefinitionInput[];
}

export interface OnboardingTaskProjection {
  id: string;
  planId: string;
  stageId: string;
  stableKey: string;
  title: string;
  description?: string;
  status: OnboardingTaskStatus;
  required: boolean;
  countsTowardProgress: boolean;
  weight: number;
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

export type WorkspaceOnboardingState =
  | { status: 'empty'; reason: 'no-active-plan' }
  | { status: 'ready'; projection: WorkspaceOnboardingProjection };

export interface TransitionOnboardingTaskRequest {
  status: OnboardingTaskStatus;
  expectedRevision: number;
  idempotencyKey: string;
  source: OnboardingTaskMutationSource;
}

export interface TransitionOnboardingTaskResponse {
  state: WorkspaceOnboardingState;
  idempotentReplay: boolean;
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
