import type {
  CreateKnowledgeMapDraftInput,
  KnowledgeMapRepositoryPort,
} from '../../knowledgeMapService';

export class KnowledgeMapService {
  constructor(private readonly repository: KnowledgeMapRepositoryPort) {}

  getPublished(accessScopes: string[], mapId?: string) {
    return this.repository.getPublished(accessScopes, mapId);
  }

  proposeFromSources(objective: string, sourceIds: string[]) {
    return this.repository.proposeFromSources(objective, sourceIds);
  }

  getNodeDetail(mapVersionId: string, nodeId: string, accessScopes: string[]) {
    return this.repository.getNodeDetail(mapVersionId, nodeId, accessScopes);
  }

  search(mapVersionId: string, query: string, accessScopes: string[]) {
    return this.repository.search(mapVersionId, query, accessScopes);
  }

  createDraft(input: CreateKnowledgeMapDraftInput, actorUserId: string) {
    return this.repository.createDraft(input, actorUserId);
  }

  publish(mapId: string, versionId: string, actorUserId: string, changeNote?: string) {
    return this.repository.publish(mapId, versionId, actorUserId, changeNote);
  }

  submitFeedback(
    input: {
      mapVersionId: string;
      nodeId?: string;
      messageId?: string;
      category: string;
      comment?: string;
    },
    actorUserId: string,
  ) {
    return this.repository.submitFeedback(input, actorUserId);
  }

  accessScopesFor(accountId: string) {
    return this.repository.accessScopesFor(accountId);
  }
}
