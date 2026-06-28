import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
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
  list(ownerId: string): Promise<SessionSummary[]>;
  create(request: CreateSessionRequest, ownerId: string): Promise<OnboardingSession>;
  get(sessionId: string, ownerId: string): Promise<OnboardingSession>;
  update(
    sessionId: string,
    request: UpdateSessionRequest,
    ownerId: string,
  ): Promise<OnboardingSession>;
  save(session: OnboardingSession): Promise<OnboardingSession>;
  delete(sessionId: string, ownerId: string): Promise<void>;
}

export class InMemorySessionRepository implements SessionRepository {
  protected readonly sessions: Map<string, StoredSession>;

  constructor(sessions = new Map<string, StoredSession>()) {
    this.sessions = sessions;
  }

  async list(ownerId: string): Promise<SessionSummary[]> {
    return [...this.sessions.values()]
      .filter((session) => session.ownerId === ownerId)
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

  async create(request: CreateSessionRequest, ownerId: string): Promise<OnboardingSession> {
    const now = new Date().toISOString();
    const session: StoredSession = {
      id: randomUUID(),
      ownerId,
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
    return toPublicSession(session);
  }

  async get(sessionId: string, ownerId: string): Promise<OnboardingSession> {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) {
      throw new SessionNotFoundError(sessionId);
    }

    return toPublicSession(session);
  }

  async update(
    sessionId: string,
    request: UpdateSessionRequest,
    ownerId: string,
  ): Promise<OnboardingSession> {
    const session = await this.getStored(sessionId, ownerId);

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
    const existing = this.sessions.get(session.id);
    if (!existing) {
      throw new SessionNotFoundError(session.id);
    }

    const stored: StoredSession = {
      ...cloneSession(session),
      ownerId: existing.ownerId,
    };
    this.sessions.set(session.id, stored);
    return toPublicSession(stored);
  }

  async delete(sessionId: string, ownerId: string): Promise<void> {
    await this.getStored(sessionId, ownerId);
    if (!this.sessions.delete(sessionId)) {
      throw new SessionNotFoundError(sessionId);
    }
  }

  private async getStored(sessionId: string, ownerId: string): Promise<StoredSession> {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) {
      throw new SessionNotFoundError(sessionId);
    }

    return cloneStoredSession(session);
  }
}

export class FileSessionRepository implements SessionRepository {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  async list(ownerId: string): Promise<SessionSummary[]> {
    return new InMemorySessionRepositoryAdapter(await this.readStore()).list(ownerId);
  }

  async create(request: CreateSessionRequest, ownerId: string): Promise<OnboardingSession> {
    const store = await this.readStore();
    const adapter = new InMemorySessionRepositoryAdapter(store);
    const session = await adapter.create(request, ownerId);
    await this.writeStore(store);
    return session;
  }

  async get(sessionId: string, ownerId: string): Promise<OnboardingSession> {
    return new InMemorySessionRepositoryAdapter(await this.readStore()).get(sessionId, ownerId);
  }

  async update(
    sessionId: string,
    request: UpdateSessionRequest,
    ownerId: string,
  ): Promise<OnboardingSession> {
    const store = await this.readStore();
    const adapter = new InMemorySessionRepositoryAdapter(store);
    const session = await adapter.update(sessionId, request, ownerId);
    await this.writeStore(store);
    return session;
  }

  async save(session: OnboardingSession): Promise<OnboardingSession> {
    const store = await this.readStore();
    const adapter = new InMemorySessionRepositoryAdapter(store);
    const saved = await adapter.save(session);
    await this.writeStore(store);
    return saved;
  }

  async delete(sessionId: string, ownerId: string): Promise<void> {
    const store = await this.readStore();
    const adapter = new InMemorySessionRepositoryAdapter(store);
    await adapter.delete(sessionId, ownerId);
    await this.writeStore(store);
  }

  private async readStore(): Promise<Map<string, StoredSession>> {
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8')) as {
        sessions?: StoredSession[];
      };
      return new Map((payload.sessions ?? []).map((session) => [session.id, session]));
    } catch (error) {
      if (isNotFoundError(error)) {
        return new Map();
      }
      throw error;
    }
  }

  private async writeStore(store: Map<string, StoredSession>): Promise<void> {
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
        await writeFile(
          tempPath,
          `${JSON.stringify({ sessions: [...store.values()] }, null, 2)}\n`,
          'utf8',
        );

        try {
          await replaceFile(tempPath, this.filePath);
        } catch (error) {
          await rm(tempPath, { force: true }).catch(() => undefined);
          throw error;
        }
      });

    await this.writeQueue;
  }
}

class InMemorySessionRepositoryAdapter extends InMemorySessionRepository {
  constructor(store: Map<string, StoredSession>) {
    super(store);
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

type StoredSession = OnboardingSession & { ownerId: string };

function cloneStoredSession(session: StoredSession): StoredSession {
  return structuredClone(session) as StoredSession;
}

function toPublicSession(session: StoredSession): OnboardingSession {
  const publicSession = cloneStoredSession(session) as Partial<StoredSession>;
  delete publicSession.ownerId;
  return publicSession as OnboardingSession;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function replaceFile(sourcePath: string, targetPath: string): Promise<void> {
  let lastError: unknown;

  for (const delayMs of [0, 25, 75, 150]) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      await rename(sourcePath, targetPath);
      return;
    } catch (error) {
      lastError = error;

      if (!isReplaceRetryableError(error)) {
        throw error;
      }
    }

    try {
      await copyFile(sourcePath, targetPath);
      await rm(sourcePath, { force: true });
      return;
    } catch (error) {
      lastError = error;

      if (!isReplaceRetryableError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function isReplaceRetryableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ['EACCES', 'EBUSY', 'EPERM'].includes(String(error.code))
  );
}
