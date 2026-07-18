import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseJsonBody, parseParams } from '../../core/http/requestParsers';
import {
  KnowledgeMapDraftBodySchema,
  KnowledgeMapProposalBodySchema,
  PublishKnowledgeMapBodySchema,
  PublishKnowledgeMapParamsSchema,
  toKnowledgeMapDraftResponseDto,
  toKnowledgeMapProposalResponseDto,
} from './knowledgeMap.dto';
import type { AdminKnowledgeMapService } from './knowledgeMap.service';

export function createAdminKnowledgeMapController(service: AdminKnowledgeMapService) {
  const propose: Controller = async (context) => {
    const body = await parseJsonBody(context.request, KnowledgeMapProposalBodySchema);
    const result = await service.propose(body);
    return result.enabled
      ? httpResult.json(toKnowledgeMapProposalResponseDto(result.value))
      : httpResult.text(result.message, 404);
  };

  const createDraft: Controller = async (context) => {
    const user = requireControllerUser(context);
    const body = await parseJsonBody(context.request, KnowledgeMapDraftBodySchema);
    const result = await service.createDraft(body, user.id);
    return result.enabled
      ? httpResult.json(toKnowledgeMapDraftResponseDto(result.value))
      : httpResult.text(result.message, 404);
  };

  const publish: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { mapId, versionId } = parseParams(context.params, PublishKnowledgeMapParamsSchema);
    const body = await parseJsonBody(context.request, PublishKnowledgeMapBodySchema);
    const result = await service.publish(mapId, versionId, body, user.id);
    return result.enabled ? httpResult.json({ ok: true }) : httpResult.text(result.message, 404);
  };

  return { propose, createDraft, publish };
}
