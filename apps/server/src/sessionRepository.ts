import { randomUUID } from 'node:crypto';
import type {
  CreateSessionRequest,
  GuideGraphState,
  OnboardingSession,
  SessionSummary,
  UpdateSessionRequest,
} from '@onboarding/shared';

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export interface SessionRepository {
  list(): Promise<SessionSummary[]>;
  create(request: CreateSessionRequest): Promise<OnboardingSession>;
  get(sessionId: string): Promise<OnboardingSession>;
  update(sessionId: string, request: UpdateSessionRequest): Promise<OnboardingSession>;
  save(session: OnboardingSession): Promise<OnboardingSession>;
  delete(sessionId: string): Promise<void>;
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, OnboardingSession>();

  async list(): Promise<SessionSummary[]> {
    return [...this.sessions.values()]
      .map((session) => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        settings: session.settings,
        chatHistory: session.chatHistory,
        guide: session.guide,
        chatMessageCount: session.chatHistory.length,
        guideNodeCount: Object.keys(session.guide.nodes).length,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(request: CreateSessionRequest): Promise<OnboardingSession> {
    const now = new Date().toISOString();
    const session: OnboardingSession = {
      id: randomUUID(),
      title: request.title?.trim() || 'New onboarding session',
      createdAt: now,
      updatedAt: now,
      settings: {
        webSearchEnabled: request.settings?.webSearchEnabled ?? false,
      },
      chatHistory: [],
      guide: createEmptyGuide(),
    };

    this.sessions.set(session.id, session);
    return cloneSession(session);
  }

  async get(sessionId: string): Promise<OnboardingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return cloneSession(session);
  }

  async update(sessionId: string, request: UpdateSessionRequest): Promise<OnboardingSession> {
    const session = await this.get(sessionId);

    if (request.title !== undefined) {
      session.title = request.title.trim() || session.title;
    }

    if (request.settings) {
      session.settings = {
        ...session.settings,
        ...request.settings,
      };
    }

    if (request.selectedNodeId !== undefined) {
      session.guide.selectedNodeId = request.selectedNodeId ?? undefined;
    }

    if (request.expandedNodeIds) {
      session.guide.expandedNodeIds = request.expandedNodeIds;
    }

    return this.save(touchSession(session));
  }

  async save(session: OnboardingSession): Promise<OnboardingSession> {
    this.sessions.set(session.id, cloneSession(session));
    return cloneSession(session);
  }

  async delete(sessionId: string): Promise<void> {
    if (!this.sessions.delete(sessionId)) {
      throw new SessionNotFoundError(sessionId);
    }
  }
}

export function touchSession(session: OnboardingSession): OnboardingSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
  };
}

function createEmptyGuide(): GuideGraphState {
  return {
    rootNodeIds: [],
    nodes: {},
    expandedNodeIds: [],
  };
}

function cloneSession(session: OnboardingSession): OnboardingSession {
  return structuredClone(session) as OnboardingSession;
}
