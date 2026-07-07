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
  sourceType?: SourceType;
  kind?: LegacySourceKind;
  score?: number;
  confidence?: number;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export type KnowledgeSource = SourceProvenance;

export interface AskResponse {
  answer: string;
  sources: SourceProvenance[];
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

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AccountUser;
  expiresAt: string;
}

export interface CurrentUserResponse {
  user: AccountUser;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sources?: SourceProvenance[];
  guideNodeIds?: string[];
  focusStepIds?: string[];
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
}

export interface OnboardingSession {
  id: string;
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

export interface ExpandStepRequest extends GuideRequest {
  stepId: string;
}

export interface GuideResponse {
  graph: GuideGraph;
  focusStepId?: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  webSearchEnabled: boolean;
  selectedStepId?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  session?: OnboardingSession;
  sources: SourceProvenance[];
  guideNodeIds?: string[];
  focusStepIds?: string[];
  draftGuideMap?: DraftGuideMap;
  usage?: AiUsageStats;
}

export interface DraftGuideMap {
  title: string;
  summary?: string;
  nodes: DraftGuideMapNode[];
}

export interface DraftGuideMapNode {
  clientId: string;
  parentClientId?: string;
  title: string;
  summary: string;
  detail?: string;
  sourceIds?: string[];
  position: number;
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
}

export interface ExpandGuideStepRequest {
  nodeId: string;
  instruction?: string;
  webSearchEnabled?: boolean;
}

export interface ExpandGuideStepResponse {
  parentNodeId: string;
  childNodeIds: string[];
  nodes: GuideNode[];
  session: OnboardingSession;
  sources: SourceProvenance[];
}

export interface CreateGuideMapRequest {
  draftGuideMap: DraftGuideMap;
}

export interface CreateGuideMapResponse {
  rootNodeIds: string[];
  nodes: GuideNode[];
  session: OnboardingSession;
  sources: SourceProvenance[];
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

export interface AdminActivityQuery {
  limit?: number;
  cursor?: string;
  eventType?: LogEventType;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  statusCode?: number;
  operation?: AiUsageOperation;
  model?: string;
  from?: string;
  to?: string;
}

export interface AdminActivitySummary {
  eventsTotal: number;
  errorsTotal: number;
  aiRequestsTotal: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AdminActivityResponse {
  events: LogEventRecord[];
  summary: AdminActivitySummary;
  nextCursor?: string;
}

export interface AdminActivityEventResponse {
  event: LogEventRecord;
}

export interface AdminActivityDeleteResponse {
  deletedCount: number;
}

export interface AdminAuditEvent {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AdminAuditResponse {
  events: AdminAuditEvent[];
}

export interface AiRateCard {
  id: string;
  provider: string;
  model: string;
  currency: string;
  inputCostPer1MTokens: number;
  outputCostPer1MTokens: number;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiRateCardRequest {
  provider?: string;
  model: string;
  currency?: string;
  inputCostPer1MTokens: number;
  outputCostPer1MTokens: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export interface AiFeeModelSummary {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedFee: number;
  currency: string;
  missingRateCardRequests: number;
}

export interface AiFeeSummaryResponse {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedFee: number;
  currency: string;
  missingRateCardRequests: number;
  byModel: Record<string, AiFeeModelSummary>;
}

export interface AiRateCardsResponse {
  rateCards: AiRateCard[];
}

export interface AiFeeAdjustment {
  id: string;
  usageEventId?: string;
  amount: number;
  currency: string;
  reason: string;
  createdByUserId: string;
  createdAt: string;
}

export interface CreateAiFeeAdjustmentRequest {
  usageEventId?: string;
  amount: number;
  currency?: string;
  reason: string;
}

export interface AiFeeAdjustmentsResponse {
  adjustments: AiFeeAdjustment[];
}
