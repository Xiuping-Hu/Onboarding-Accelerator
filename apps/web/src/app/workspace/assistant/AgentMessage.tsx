import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import { useCallback } from 'react';
import { AssistantEvidence } from './AssistantEvidence';
import { MessageRoleCircle } from './MessageRoleCircle';
import { TypedMarkdown } from './TypedMarkdown';

export function AgentMessage({
  evidenceExpanded,
  messageById,
  onToggleEvidence,
  onTypingComplete,
  typingMessageId,
}: {
  evidenceExpanded: string[];
  messageById: Map<string, ChatMessage>;
  onToggleEvidence: (messageId: string) => void;
  onTypingComplete: (messageId: string) => void;
  typingMessageId: string | null;
}) {
  const messageId = useAuiState((state) => state.message.id);
  const sourceMessage = messageById.get(messageId);
  const messageSources = sourceMessage?.sources ?? [];
  const isExpanded = evidenceExpanded.includes(messageId);
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
          <AssistantEvidence
            expanded={isExpanded}
            messageId={messageId}
            onToggle={onToggleEvidence}
            sources={messageSources}
          />
        ) : null}
      </div>
    </MessagePrimitive.Root>
  );
}
