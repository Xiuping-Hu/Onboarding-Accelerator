import type {
  GenerateGuideRootRequest,
  GenerateGuideRootResponse,
  GuideNode,
  SourceProvenance,
} from '@onboarding/shared';
import type { SessionRepository } from './sessionRepository';

export class GuideOrchestrationService {
  constructor(private readonly sessions: SessionRepository) {}

  async generateRoot(
    sessionId: string,
    _request: GenerateGuideRootRequest,
    ownerId: string,
  ): Promise<GenerateGuideRootResponse> {
    const session = await this.sessions.get(sessionId, ownerId);
    const nodes = session.guide.rootNodeIds
      .map((nodeId) => session.guide.nodes[nodeId])
      .filter((node): node is GuideNode => Boolean(node));

    return {
      rootNodeIds: session.guide.rootNodeIds,
      nodes,
      session,
      sources: collectSources(Object.values(session.guide.nodes)),
    };
  }
}

function collectSources(nodes: GuideNode[]): SourceProvenance[] {
  const sourceById = new Map<string, SourceProvenance>();
  for (const node of nodes) {
    for (const source of node.sources) {
      sourceById.set(source.id, source);
    }
  }
  return [...sourceById.values()];
}
