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
}

export interface HealthResponse {
  status: 'ok';
  service: string;
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
