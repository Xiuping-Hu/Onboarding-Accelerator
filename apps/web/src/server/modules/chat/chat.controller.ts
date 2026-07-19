import type { ChatService } from './chat.service';
import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseJsonBody, parseParams } from '../../core/http/requestParsers';
import { ChatBodySchema, ChatParamsSchema, toChatResponseDto } from './chat.dto';

export function createChatController(service: ChatService) {
  const send: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sessionId } = parseParams(context.params, ChatParamsSchema);
    const body = await parseJsonBody(context.request, ChatBodySchema);
    return httpResult.json(
      toChatResponseDto(
        await service.chat(
          sessionId,
          {
            ...body,
            sessionId,
            webSearchEnabled: body.webSearchEnabled ?? false,
          },
          user.id,
        ),
      ),
    );
  };
  return { send };
}
