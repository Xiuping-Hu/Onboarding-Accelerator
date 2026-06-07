export interface AskRequest {
  question: string;
  userId?: string;
  conversationId?: string;
}

export type SourceType = 'knowledge_base' | 'web';

export interface SourceProvenance {
  id: string;
  title: string;
  excerpt: string;
  uri?: string;
  sourceType: SourceType;
  score?: number;
  confidence?: number;
}

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

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  settings: UserSettings;
  chatMessageCount: number;
  guideNodeCount: number;
}

export interface ListSessionsResponse {
  sessions: SessionSummary[];
}

export interface CreateSessionRequest {
  title?: string;
  settings?: Partial<UserSettings>;
}

export type CreateSessionResponse = OnboardingSession;

export interface UpdateSessionRequest {
  title?: string;
  settings?: Partial<UserSettings>;
  selectedNodeId?: string | null;
  expandedNodeIds?: string[];
}

export type GetSessionResponse = OnboardingSession;
export type UpdateSessionResponse = OnboardingSession;

export interface ChatRequest {
  message: string;
  webSearchEnabled?: boolean;
}

export interface ChatResponse {
  message: ChatMessage;
  session: OnboardingSession;
  sources: SourceProvenance[];
  guideNodeIds: string[];
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
