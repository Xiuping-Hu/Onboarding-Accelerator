import { randomUUID } from 'node:crypto';
import type {
  CreateSessionRequest,
  GuideGraphState,
  OnboardingSession,
  SessionSummary,
  UpdateSessionRequest,
  UserSettings,
} from '@onboarding/shared';
import type { DatabaseClient } from './database';
import { SessionNotFoundError, type SessionRepository, touchSession } from './sessionRepository';

interface SessionRow {
  id: string;
  owner_id: string;
  title: string;
  created_at: Date | string;
  updated_at: Date | string;
  settings: UserSettings | string;
  chat_history: OnboardingSession['chatHistory'] | string;
  guide: GuideGraphState | string;
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(ownerId: string): Promise<SessionSummary[]> {
    const result = await this.db.query<SessionRow>(
      `select id, owner_id, title, created_at, updated_at, settings, chat_history, guide
       from onboarding_sessions
       where owner_id = $1
       order by updated_at desc`,
      [ownerId],
    );

    return result.rows.map((row) => {
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
      title: request.title?.trim() || 'Untitled onboarding plan',
      createdAt: now,
      updatedAt: now,
      settings: {
        webSearchEnabled: request.settings?.webSearchEnabled ?? false,
      },
      chatHistory: [],
      guide: createEmptyGuide(),
    };

    const result = await this.db.query<SessionRow>(
      `insert into onboarding_sessions
        (id, owner_id, title, created_at, updated_at, settings, chat_history, guide)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
       returning id, owner_id, title, created_at, updated_at, settings, chat_history, guide`,
      [
        session.id,
        ownerId,
        session.title,
        session.createdAt,
        session.updatedAt,
        JSON.stringify(session.settings),
        JSON.stringify(session.chatHistory),
        JSON.stringify(session.guide),
      ],
    );

    return toPublicSession(requireRow(result.rows[0], session.id));
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
    const result = await this.db.query<SessionRow>(
      `update onboarding_sessions
       set title = $2,
           updated_at = $3,
           settings = $4::jsonb,
           chat_history = $5::jsonb,
           guide = $6::jsonb
       where id = $1 and owner_id = $7
       returning id, owner_id, title, created_at, updated_at, settings, chat_history, guide`,
      [
        session.id,
        session.title,
        session.updatedAt,
        JSON.stringify(session.settings),
        JSON.stringify(session.chatHistory),
        JSON.stringify(session.guide),
        ownerId,
      ],
    );

    return toPublicSession(requireRow(result.rows[0], session.id));
  }

  async delete(sessionId: string, ownerId: string): Promise<void> {
    const result = await this.db.query(
      'delete from onboarding_sessions where id = $1 and owner_id = $2',
      [sessionId, ownerId],
    );

    if (result.rowCount === 0) {
      throw new SessionNotFoundError(sessionId);
    }
  }

  private async getRow(sessionId: string, ownerId: string): Promise<SessionRow> {
    const result = await this.db.query<SessionRow>(
      `select id, owner_id, title, created_at, updated_at, settings, chat_history, guide
       from onboarding_sessions
       where id = $1 and owner_id = $2`,
      [sessionId, ownerId],
    );

    return requireRow(result.rows[0], sessionId);
  }
}

function requireRow(row: SessionRow | undefined, sessionId: string): SessionRow {
  if (!row) {
    throw new SessionNotFoundError(sessionId);
  }

  return row;
}

function toPublicSession(row: SessionRow): OnboardingSession {
  return {
    id: row.id,
    title: row.title,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    settings: parseJson(row.settings),
    chatHistory: parseJson(row.chat_history),
    guide: parseJson(row.guide),
  };
}

function parseJson<T>(value: T | string): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : value;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function createEmptyGuide(): GuideGraphState {
  return {
    rootNodeIds: [],
    nodes: {},
    expandedNodeIds: [],
  };
}
