import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseJsonBody, parseParams } from '../../core/http/requestParsers';
import {
  ActivateOnboardingPlanBodySchema,
  OnboardingSessionParamsSchema,
  OnboardingTaskParamsSchema,
  TransitionOnboardingTaskBodySchema,
} from './onboarding.dto';
import type { OnboardingService } from './onboarding.service';

export function createOnboardingController(service: OnboardingService) {
  const get: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    return httpResult.json(await service.get(sessionId, user.id));
  };

  const activate: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, OnboardingSessionParamsSchema);
    const body = await parseJsonBody(context.request, ActivateOnboardingPlanBodySchema);
    return httpResult.json(await service.activate(sessionId, body, user), 201);
  };

  const transitionTask: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId, taskId } = parseParams(context.params, OnboardingTaskParamsSchema);
    const body = await parseJsonBody(context.request, TransitionOnboardingTaskBodySchema);
    return httpResult.json(await service.transitionTask(sessionId, taskId, body, user));
  };

  return { get, activate, transitionTask };
}
