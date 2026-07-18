import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseJsonBody, parseParams, parseQuery } from '../../core/http/requestParsers';
import {
  GenerateGuideRootBodySchema,
  GuideFeedbackBodySchema,
  GuideNodeParamsSchema,
  GuideSearchQuerySchema,
  GuideSessionParamsSchema,
  toGenerateGuideRootResponseDto,
  toGuideNodeResponseDto,
  toGuideSearchResponseDto,
} from './guide.dto';
import type { GuideService } from './guide.service';

export function createGuideController(service: GuideService) {
  const generateRoot: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, GuideSessionParamsSchema);
    const body = await parseJsonBody(context.request, GenerateGuideRootBodySchema);
    return httpResult.json(
      toGenerateGuideRootResponseDto(await service.generateRoot(sessionId, body, user.id)),
    );
  };

  const getNode: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId, nodeId } = parseParams(context.params, GuideNodeParamsSchema);
    const result = await service.getNodeDetail(sessionId, nodeId, user.id);
    return result.enabled
      ? httpResult.json(toGuideNodeResponseDto(result.value))
      : httpResult.text(result.message, 404);
  };

  const search: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, GuideSessionParamsSchema);
    const { query } = parseQuery(context.request, GuideSearchQuerySchema);
    const result = await service.search(sessionId, query, user.id);
    return result.enabled
      ? httpResult.json(toGuideSearchResponseDto(result.value))
      : httpResult.text(result.message, 404);
  };

  const submitFeedback: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, GuideSessionParamsSchema);
    const body = await parseJsonBody(context.request, GuideFeedbackBodySchema);
    const result = await service.submitFeedback(sessionId, body, user.id);
    return result.enabled ? httpResult.json({ ok: true }) : httpResult.text(result.message, 404);
  };

  return { generateRoot, getNode, search, submitFeedback };
}
