import type { KnowledgeMapService as KnowledgeMapDomainService } from './knowledgeMap.application.service';
import type {
  KnowledgeMapDraftBody,
  KnowledgeMapProposalBody,
  PublishKnowledgeMapBody,
} from './knowledgeMap.dto';

export type KnowledgeMapFeatureResult<T> =
  | { enabled: true; value: T }
  | { enabled: false; message: string };

export class AdminKnowledgeMapService {
  constructor(private readonly knowledgeMaps?: KnowledgeMapDomainService) {}

  async propose(
    input: KnowledgeMapProposalBody,
  ): Promise<
    KnowledgeMapFeatureResult<Awaited<ReturnType<KnowledgeMapDomainService['proposeFromSources']>>>
  > {
    if (!this.knowledgeMaps) return disabled();
    return {
      enabled: true,
      value: await this.knowledgeMaps.proposeFromSources(input.objective, input.sourceIds),
    };
  }

  async createDraft(input: KnowledgeMapDraftBody, actorUserId: string) {
    if (!this.knowledgeMaps) return disabled<{ mapId: string; versionId: string }>();
    return {
      enabled: true as const,
      value: await this.knowledgeMaps.createDraft(input, actorUserId),
    };
  }

  async publish(
    mapId: string,
    versionId: string,
    input: PublishKnowledgeMapBody,
    actorUserId: string,
  ) {
    if (!this.knowledgeMaps) return disabled<void>();
    await this.knowledgeMaps.publish(mapId, versionId, actorUserId, input.changeNote);
    return { enabled: true as const, value: undefined };
  }
}

function disabled<T>(): KnowledgeMapFeatureResult<T> {
  return { enabled: false, message: 'Knowledge maps are disabled' };
}
