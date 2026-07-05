import type { ChatMessage } from '@onboarding/shared';
import type { ThreadMessageLike } from '@assistant-ui/react';

export function toAssistantMessage(message: ChatMessage): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: [{ type: 'text', text: message.content }],
    createdAt: new Date(message.createdAt),
    metadata: {
      custom: {
        focusStepIds: message.focusStepIds ?? [],
        guideNodeIds: message.guideNodeIds ?? [],
        sources: message.sources ?? [],
        usage: message.usage,
      },
    },
  } as ThreadMessageLike;
}

export function getAppendMessageText(message: {
  content?: readonly unknown[];
  role?: string;
}): string {
  return (
    message.content
      ?.map((part) => {
        if (
          typeof part === 'object' &&
          part !== null &&
          'type' in part &&
          part.type === 'text' &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }

        return '';
      })
      .join('')
      .trim() ?? ''
  );
}
