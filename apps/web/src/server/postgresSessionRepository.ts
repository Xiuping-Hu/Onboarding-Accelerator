import { randomUUID } from 'node:crypto';
import type {
  Prisma,
  OnboardingSession as PrismaOnboardingSession,
} from '@/generated/prisma/client';
import type {
  CreateSessionRequest,
  GuideGraphState,
  OnboardingSession,
  SessionSummary,
  UpdateSessionRequest,
  UserSettings,
} from '@onboarding/shared';
import type { PrismaDatabase } from './infrastructure/prisma/prismaTypes';
import { SessionNotFoundError, type SessionRepository, touchSession } from './sessionRepository';

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly db: PrismaDatabase) {}

  async list(ownerId: string): Promise<SessionSummary[]> {
    const rows = await this.db.onboardingSession.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => {
      const session = toPublicSession(row);
      return {
        ...session,
        chatMessageCount: session.chatHistory.length,
        guideNodeCount: Object.keys(session.guide.nodes).length,
      };
    });
  }

  async create(request: CreateSessionRequest, ownerId: string): Promise<OnboardingSession> {
    const now = new Date().toISOString();
    const session: OnboardingSession = {
      id: randomUUID(),
      revision: 0,
      title: request.title?.trim() || 'Untitled onboarding plan',
      createdAt: now,
      updatedAt: now,
      settings: {
        webSearchEnabled: request.settings?.webSearchEnabled ?? false,
      },
      chatHistory: [],
      guide: createEmptyGuide(),
    };

    return toPublicSession(
      await this.db.onboardingSession.create({
        data: {
          id: session.id,
          ownerId,
          title: session.title,
          createdAt: new Date(session.createdAt),
          updatedAt: new Date(session.updatedAt),
          settings: toJson(session.settings),
          chatHistory: toJson(session.chatHistory),
          guide: toJson(session.guide),
        },
      }),
    );
  }

  async get(sessionId: string, ownerId: string): Promise<OnboardingSession> {
    const row = await this.getRow(sessionId, ownerId);
    return toPublicSession(row);
  }

  async update(
    sessionId: string,
    request: UpdateSessionRequest,
    ownerId: string,
  ): Promise<OnboardingSession> {
    const session = await this.get(sessionId, ownerId);

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

    return this.save(touchSession(session), ownerId);
  }

  async save(session: OnboardingSession, ownerId: string): Promise<OnboardingSession> {
    const updated = await this.db.onboardingSession.updateMany({
      where: { id: session.id, ownerId, revision: BigInt(session.revision ?? 0) },
      data: {
        title: session.title,
        updatedAt: new Date(session.updatedAt),
        settings: toJson(session.settings),
        chatHistory: toJson(session.chatHistory),
        guide: toJson(session.guide),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new SessionNotFoundError(session.id);
    return this.get(session.id, ownerId);
  }

  async delete(sessionId: string, ownerId: string): Promise<void> {
    const result = await this.db.onboardingSession.deleteMany({
      where: { id: sessionId, ownerId },
    });
    if (result.count === 0) {
      throw new SessionNotFoundError(sessionId);
    }
  }

  private async getRow(sessionId: string, ownerId: string): Promise<PrismaOnboardingSession> {
    const row = await this.db.onboardingSession.findFirst({ where: { id: sessionId, ownerId } });
    return requireRow(row, sessionId);
  }
}

function requireRow(
  row: PrismaOnboardingSession | null | undefined,
  sessionId: string,
): PrismaOnboardingSession {
  if (!row) {
    throw new SessionNotFoundError(sessionId);
  }

  return row;
}

function toPublicSession(row: PrismaOnboardingSession): OnboardingSession {
  return {
    id: row.id,
    revision: Number(row.revision),
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    settings: parseJson<UserSettings>(row.settings),
    chatHistory: parseJson<OnboardingSession['chatHistory']>(row.chatHistory),
    guide: parseJson(row.guide),
  };
}

function parseJson<T>(value: Prisma.JsonValue): T {
  return structuredClone(value) as T;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function createEmptyGuide(): GuideGraphState {
  return {
    rootNodeIds: [],
    nodes: {},
    expandedNodeIds: [],
  };
}
