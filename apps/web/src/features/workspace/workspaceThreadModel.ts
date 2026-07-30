import type { ChatMessage, KnowledgeSource, OnboardingSession } from '@onboarding/shared';

export type MessagesBySessionId = Record<string, ChatMessage[]>;

export function mergeSources(
  existing: KnowledgeSource[],
  incoming: KnowledgeSource[],
): KnowledgeSource[] {
  const byId = new Map(existing.map((source) => [source.id, source]));
  for (const source of incoming) byId.set(source.id, source);
  return [...byId.values()];
}

export function mergeSourcesForActiveSession(
  existing: KnowledgeSource[],
  incoming: KnowledgeSource[],
  activeSessionId: string | null,
  responseSessionId: string,
): KnowledgeSource[] {
  return activeSessionId === responseSessionId ? mergeSources(existing, incoming) : existing;
}

export function indexSessionMessages(sessions: OnboardingSession[]): MessagesBySessionId {
  return Object.fromEntries(sessions.map((session) => [session.id, session.chatHistory]));
}

export function appendSessionMessage(
  messagesBySessionId: MessagesBySessionId,
  sessionId: string,
  message: ChatMessage,
): MessagesBySessionId {
  return {
    ...messagesBySessionId,
    [sessionId]: [...(messagesBySessionId[sessionId] ?? []), message],
  };
}

export function replaceSessionMessages(
  messagesBySessionId: MessagesBySessionId,
  sessionId: string,
  messages: ChatMessage[],
): MessagesBySessionId {
  return { ...messagesBySessionId, [sessionId]: messages };
}

export function removeSessionMessages(
  messagesBySessionId: MessagesBySessionId,
  sessionId: string,
): MessagesBySessionId {
  return Object.fromEntries(Object.entries(messagesBySessionId).filter(([id]) => id !== sessionId));
}

export function toPlanThreads(sessions: OnboardingSession[]) {
  return sessions.map((session) => ({
    id: session.id,
    status: 'regular' as const,
    title: session.title,
    custom: { updatedAt: session.updatedAt },
  }));
}
