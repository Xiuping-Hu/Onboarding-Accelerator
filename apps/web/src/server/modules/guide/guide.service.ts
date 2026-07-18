import type {
  GenerateGuideRootResponse,
  GuideNode,
  KnowledgeMapNodeDetail,
} from '@onboarding/shared';
import type { GuideOrchestrationService } from '../../guideService';
import { KnowledgeMapNotFoundError } from '../../knowledgeMapService';
import type { KnowledgeMapService } from '../knowledge-maps/knowledgeMap.application.service';
import { projectKnowledgeMapToGuide } from '../../knowledgeMapProjection';
import type { SessionRepository } from '../../sessionRepository';
import type { GenerateGuideRootBody, GuideFeedbackBody } from './guide.dto';

export type GuideFeatureResult<T> =
  | { enabled: true; value: T }
  | { enabled: false; message: string };

export class GuideService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly legacyGuide: GuideOrchestrationService,
    private readonly knowledgeMaps?: KnowledgeMapService,
  ) {}

  async generateRoot(
    sessionId: string,
    input: GenerateGuideRootBody,
    ownerId: string,
  ): Promise<GenerateGuideRootResponse> {
    if (!this.knowledgeMaps) {
      const response = await this.legacyGuide.generateRoot(sessionId, input, ownerId);
      return { ...response, knowledgeMapEnabled: false };
    }

    const session = await this.sessions.get(sessionId, ownerId);
    const scopes = await this.knowledgeMaps.accessScopesFor(ownerId);
    try {
      const map = await this.knowledgeMaps.getPublished(scopes);
      const guide = projectKnowledgeMapToGuide(map);
      return {
        rootNodeIds: guide.rootNodeIds,
        nodes: guide.rootNodeIds
          .map((nodeId) => guide.nodes[nodeId])
          .filter((node): node is GuideNode => Boolean(node)),
        session: { ...session, guide },
        sources: map.nodes.flatMap((node) => node.sources),
        knowledgeMapEnabled: true,
      };
    } catch (error) {
      if (!(error instanceof KnowledgeMapNotFoundError)) throw error;
      return {
        rootNodeIds: [],
        nodes: [],
        session,
        sources: [],
        knowledgeMapEnabled: true,
      };
    }
  }

  async getNodeDetail(
    sessionId: string,
    nodeId: string,
    ownerId: string,
  ): Promise<GuideFeatureResult<KnowledgeMapNodeDetail>> {
    if (!this.knowledgeMaps) return disabled();
    const session = await this.sessions.get(sessionId, ownerId);
    const versionId = session.guide.knowledgeMapVersionId;
    if (!versionId) return noPublishedMap();
    const scopes = await this.knowledgeMaps.accessScopesFor(ownerId);
    return {
      enabled: true,
      value: await this.knowledgeMaps.getNodeDetail(versionId, nodeId, scopes),
    };
  }

  async search(
    sessionId: string,
    query: string,
    ownerId: string,
  ): Promise<GuideFeatureResult<KnowledgeMapNodeDetail[]>> {
    if (!this.knowledgeMaps) return disabled();
    const session = await this.sessions.get(sessionId, ownerId);
    if (!session.guide.knowledgeMapVersionId) return { enabled: true, value: [] };
    const scopes = await this.knowledgeMaps.accessScopesFor(ownerId);
    return {
      enabled: true,
      value: await this.knowledgeMaps.search(session.guide.knowledgeMapVersionId, query, scopes),
    };
  }

  async submitFeedback(
    sessionId: string,
    input: GuideFeedbackBody,
    ownerId: string,
  ): Promise<GuideFeatureResult<void>> {
    if (!this.knowledgeMaps) return disabled();
    const session = await this.sessions.get(sessionId, ownerId);
    const mapVersionId = session.guide.knowledgeMapVersionId;
    if (!mapVersionId) return noPublishedMap();
    await this.knowledgeMaps.submitFeedback({ ...input, mapVersionId }, ownerId);
    return { enabled: true, value: undefined };
  }
}

function disabled<T>(): GuideFeatureResult<T> {
  return { enabled: false, message: 'Knowledge maps are disabled' };
}

function noPublishedMap<T>(): GuideFeatureResult<T> {
  return { enabled: false, message: 'Session does not use a published knowledge map' };
}
