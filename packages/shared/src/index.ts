export interface AskRequest {
  question: string;
  userId?: string;
  conversationId?: string;
  webSearchEnabled?: boolean;
}

export interface KnowledgeSource {
  id: string;
  title: string;
  excerpt: string;
  uri?: string;
  kind?: 'knowledge-base' | 'web';
}

export interface AskResponse {
  answer: string;
  sources: KnowledgeSource[];
}

export interface HealthResponse {
  status: 'ok';
  service: string;
}

export interface OnboardingSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface CreateSessionRequest {
  title?: string;
}

export interface ListSessionsResponse {
  sessions: OnboardingSession[];
}

export interface CreateSessionResponse {
  session: OnboardingSession;
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

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sources?: KnowledgeSource[];
  focusStepIds?: string[];
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  webSearchEnabled: boolean;
  selectedStepId?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  focusStepIds?: string[];
  sources: KnowledgeSource[];
}
