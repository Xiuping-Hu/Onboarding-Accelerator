export interface AskRequest {
  question: string;
  userId?: string;
  conversationId?: string;
}

export interface KnowledgeSource {
  id: string;
  title: string;
  excerpt: string;
  uri?: string;
}

export interface AskResponse {
  answer: string;
  sources: KnowledgeSource[];
}

export interface HealthResponse {
  status: 'ok';
  service: string;
}
