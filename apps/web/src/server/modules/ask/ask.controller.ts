import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseJsonBody } from '../../core/http/requestParsers';
import { AskBodySchema, toAskResponseDto } from './ask.dto';
import type { AskService } from './ask.service';

export function createAskController(service: AskService) {
  const ask: Controller = async (context) => {
    const user = requireControllerUser(context);
    const body = await parseJsonBody(context.request, AskBodySchema);
    return httpResult.json(toAskResponseDto(await service.ask(body, user.id)));
  };
  return { ask };
}
