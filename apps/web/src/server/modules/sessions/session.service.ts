import type { OnboardingSession, SessionSummary } from '@onboarding/shared';
import type { SessionRepository } from '../../sessionRepository';
import { touchSession } from '../../sessionRepository';
import type { CreateSessionBody, UpdateSessionBody } from './session.dto';

export class SessionService {
  constructor(private readonly sessions: SessionRepository) {}

  list(ownerId: string): Promise<SessionSummary[]> {
    return this.sessions.list(ownerId);
  }

  create(input: CreateSessionBody, ownerId: string): Promise<OnboardingSession> {
    return this.sessions.create(input, ownerId);
  }

  get(sessionId: string, ownerId: string): Promise<OnboardingSession> {
    return this.sessions.get(sessionId, ownerId);
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

    return this.sessions.save(touchSession(session), ownerId);
  }

  remove(sessionId: string, ownerId: string): Promise<void> {
    return this.sessions.delete(sessionId, ownerId);
  }
}
