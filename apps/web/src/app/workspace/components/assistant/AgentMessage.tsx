import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import { useCallback } from 'react';
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
    <MessagePrimitive.Root
      className="flex w-full min-w-0 max-w-full items-end justify-start gap-2"
      data-role="assistant"
    >
      <MessageRoleCircle label="AI" role="assistant" />
      <div className="min-w-0 max-w-[calc(100%-36px)] rounded-xl border border-workspace-border bg-white p-3 text-slate-700 [overflow-wrap:anywhere]">
        <span className="sr-only">Onboarding assistant</span>
        {sourceMessage?.focusStepIds?.length ? (
          <div className="mb-1 flex min-h-4 items-center justify-between gap-2">
            <small className="text-[11px] text-workspace-muted">
              Related map step highlighted.
            </small>
          </div>
        ) : null}
        {sourceMessage ? (
          <TypedMarkdown
            animate={isTyping}
            citationSegments={sourceMessage.citationSegments}
            content={sourceMessage.content}
            onComplete={finishTyping}
            sources={messageSources}
            sourcesUnavailable={sourceMessage.sourceLinkStatus === 'unavailable'}
          />
        ) : (
          <MessagePrimitive.Parts />
        )}
      </div>
    </MessagePrimitive.Root>
  );
}
