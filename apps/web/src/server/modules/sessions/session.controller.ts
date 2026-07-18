import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseJsonBody, parseParams } from '../../core/http/requestParsers';
import {
  CreateSessionBodySchema,
  SessionIdParamsSchema,
  UpdateSessionBodySchema,
  toCreateSessionResponseDto,
  toGetSessionResponseDto,
  toListSessionsResponseDto,
  toUpdateSessionResponseDto,
} from './session.dto';
import type { SessionService } from './session.service';

export function createSessionController(service: SessionService) {
  const list: Controller = async (context) => {
    const user = requireControllerUser(context);
    return httpResult.json(toListSessionsResponseDto(await service.list(user.id)));
  };

  const create: Controller = async (context) => {
    const user = requireControllerUser(context);
    const body = await parseJsonBody(context.request, CreateSessionBodySchema);
    return httpResult.json(toCreateSessionResponseDto(await service.create(body, user.id)), 201);
  };

  const get: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, SessionIdParamsSchema);
    return httpResult.json(toGetSessionResponseDto(await service.get(sessionId, user.id)));
  };

  const update: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, SessionIdParamsSchema);
    const body = await parseJsonBody(context.request, UpdateSessionBodySchema);
    return httpResult.json(
      toUpdateSessionResponseDto(await service.update(sessionId, body, user.id)),
    );
  };

  const remove: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, SessionIdParamsSchema);
    await service.remove(sessionId, user.id);
    return httpResult.empty();
  };

  return { list, create, get, update, remove };
}
