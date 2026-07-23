import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseJsonBody, parseParams } from '../../core/http/requestParsers';
import {
  CorrectRagWorkflowBodySchema,
  RagWorkflowRunParamsSchema,
  RagWorkflowSessionParamsSchema,
  ResumeRagWorkflowBodySchema,
  StartRagWorkflowBodySchema,
  toRagWorkflowEventsResponseDto,
  toRagWorkflowResponseDto,
} from './ragWorkflow.dto';
import type { RagWorkflowService } from './ragWorkflow.service';

export function createRagWorkflowController(service: RagWorkflowService) {
  const start: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, RagWorkflowSessionParamsSchema);
    const body = await parseJsonBody(context.request, StartRagWorkflowBodySchema);
    return httpResult.json(
      toRagWorkflowResponseDto(await service.start(sessionId, body, user, context.requestId)),
      201,
    );
  };

  const get: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId, runId } = parseParams(context.params, RagWorkflowRunParamsSchema);
    return httpResult.json(toRagWorkflowResponseDto(await service.get(sessionId, runId, user)));
  };

  const events: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId, runId } = parseParams(context.params, RagWorkflowRunParamsSchema);
    return httpResult.json(
      toRagWorkflowEventsResponseDto(await service.events(sessionId, runId, user)),
    );
  };

  const resume: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId, runId } = parseParams(context.params, RagWorkflowRunParamsSchema);
    const body = await parseJsonBody(context.request, ResumeRagWorkflowBodySchema);
    return httpResult.json(
      toRagWorkflowResponseDto(
        await service.resume(sessionId, runId, body, user, context.requestId),
      ),
    );
  };

  const correct: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId, runId } = parseParams(context.params, RagWorkflowRunParamsSchema);
    const body = await parseJsonBody(context.request, CorrectRagWorkflowBodySchema);
    return httpResult.json(
      toRagWorkflowResponseDto(
        await service.correct(sessionId, runId, body, user, context.requestId),
      ),
    );
  };

  return { start, get, events, resume, correct };
}
