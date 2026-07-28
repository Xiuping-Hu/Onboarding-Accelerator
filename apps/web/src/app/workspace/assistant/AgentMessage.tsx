import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import { useCallback } from 'react';
import { AssistantSourcesPopover } from './AssistantSourcesPopover';
import { MessageRoleCircle } from './MessageRoleCircle';
import { TypedMarkdown } from './TypedMarkdown';

export function AgentMessage({
  messageById,
  onTypingComplete,
  typingMessageId,
}: {
  messageById: Map<string, ChatMessage>;
  onTypingComplete: (messageId: string) => void;
  typingMessageId: string | null;
}) {
  const messageId = useAuiState((state) => state.message.id);
  const sourceMessage = messageById.get(messageId);
  const messageSources = sourceMessage?.sources ?? [];
  const isTyping = typingMessageId === messageId;
  const finishTyping = useCallback(
    () => onTypingComplete(messageId),
    [messageId, onTypingComplete],
  );

  return (
    <MessagePrimitive.Root className="message assistant" data-role="assistant">
      <MessageRoleCircle label="AI" role="assistant" />
      <div className="message-bubble">
        <span className="sr-only">Onboarding assistant</span>
        {sourceMessage?.focusStepIds?.length ? (
          <div className="message-header">
            <small>Related map step highlighted.</small>
          </div>
        ) : null}
        {sourceMessage ? (
          <TypedMarkdown
            animate={isTyping}
            content={sourceMessage.content}
            onComplete={finishTyping}
          />
        ) : (
          <MessagePrimitive.Parts />
        )}
        {!isTyping ? (
          <AssistantSourcesPopover
            sources={messageSources}
            unavailable={sourceMessage?.sourceLinkStatus === 'unavailable'}
          />
        ) : null}
      </div>
    </MessagePrimitive.Root>
  );
}
