import type { OnboardingSession, SessionSummary } from '@onboarding/shared';
import type { SessionRepository } from '../../sessionRepository';
import { DirectSourceLinkResolver, type SourceLinkResolver } from '../../sourceLinkService';
import { touchSession } from '../../sessionRepository';
import type { CreateSessionBody, UpdateSessionBody } from './session.dto';

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly sourceLinks: SourceLinkResolver = new DirectSourceLinkResolver(),
  ) {}

  async list(ownerId: string): Promise<SessionSummary[]> {
    const sessions = await this.sessions.list(ownerId);
    return Promise.all(
      sessions.map((session) => this.sourceLinks.hydrateSession(session, ownerId)),
    );
  }

  async create(input: CreateSessionBody, ownerId: string): Promise<OnboardingSession> {
    return this.sourceLinks.hydrateSession(await this.sessions.create(input, ownerId), ownerId);
  }

  async get(sessionId: string, ownerId: string): Promise<OnboardingSession> {
    return this.sourceLinks.hydrateSession(await this.sessions.get(sessionId, ownerId), ownerId);
  }

  async update(
    sessionId: string,
    input: UpdateSessionBody,
    ownerId: string,
  ): Promise<OnboardingSession> {
    const session = await this.sessions.get(sessionId, ownerId);

    if (input.title !== undefined) session.title = input.title.trim() || session.title;
    if (input.settings) session.settings = { ...session.settings, ...input.settings };
    if (input.selectedNodeId !== undefined) {
      session.guide.selectedNodeId = input.selectedNodeId ?? undefined;
    }
    if (input.expandedNodeIds) session.guide.expandedNodeIds = input.expandedNodeIds;

    return this.sourceLinks.hydrateSession(
      await this.sessions.save(touchSession(session), ownerId),
      ownerId,
    );
  }

  remove(sessionId: string, ownerId: string): Promise<void> {
    return this.sessions.delete(sessionId, ownerId);
  }
}
