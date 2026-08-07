import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseJsonBody, parseParams } from '../../core/http/requestParsers';
import {
  ApplyRoadmapAiProposalBodySchema,
  CancelOnboardingPlanBodySchema,
  CreateOnboardingPlanBodySchema,
  GenerateOnboardingPlanBodySchema,
  OnboardingProposalParamsSchema,
  OnboardingSessionParamsSchema,
  OnboardingTaskParamsSchema,
  RequestRoadmapAiProposalBodySchema,
  RoadmapCommandBodySchema,
  TransitionOnboardingTaskBodySchema,
} from './onboarding.dto';
import type { OnboardingService } from './onboarding.service';

export function createOnboardingController(service: OnboardingService) {
  const get: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    return httpResult.json(await service.get(sessionId, user.id));
  };

  const create: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    const body = await parseJsonBody(context.request, CreateOnboardingPlanBodySchema);
    return httpResult.json(await service.create(sessionId, body, user), 201);
  };

  const generate: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    const body = await parseJsonBody(context.request, GenerateOnboardingPlanBodySchema);
    return httpResult.json(await service.generate(sessionId, body, user), 201);
  };

  const commandImpact: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    const body = await parseJsonBody(context.request, RoadmapCommandBodySchema);
    return httpResult.json(await service.commandImpact(sessionId, body, user));
  };

  const applyCommand: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    const body = await parseJsonBody(context.request, RoadmapCommandBodySchema);
    return httpResult.json(await service.applyCommand(sessionId, body, user));
  };

  const proposeChange: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    const body = await parseJsonBody(context.request, RequestRoadmapAiProposalBodySchema);
    return httpResult.json(await service.proposeChange(sessionId, body, user), 201);
  };

  const applyProposal: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId, proposalId } = parseParams(context.params, OnboardingProposalParamsSchema);
    const body = await parseJsonBody(context.request, ApplyRoadmapAiProposalBodySchema);
    return httpResult.json(await service.applyProposal(sessionId, proposalId, body, user));
  };

  const dismissProposal: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId, proposalId } = parseParams(context.params, OnboardingProposalParamsSchema);
    await service.dismissProposal(sessionId, proposalId, user);
    return httpResult.empty();
  };

  const history: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    return httpResult.json(await service.history(sessionId, user));
  };

  const cancellationImpact: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    return httpResult.json(await service.cancellationImpact(sessionId, user));
  };

  const cancel: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    const body = await parseJsonBody(context.request, CancelOnboardingPlanBodySchema);
    return httpResult.json(await service.cancel(sessionId, body, user));
  };

  const transitionTask: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId, taskId } = parseParams(context.params, OnboardingTaskParamsSchema);
    const body = await parseJsonBody(context.request, TransitionOnboardingTaskBodySchema);
    return httpResult.json(await service.transitionTask(sessionId, taskId, body, user));
  };

  return {
    get,
    create,
    generate,
    commandImpact,
    applyCommand,
    proposeChange,
    applyProposal,
    dismissProposal,
    history,
    cancellationImpact,
    cancel,
    transitionTask,
  };
}
