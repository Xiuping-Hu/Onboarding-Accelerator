import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AssistantEvidence } from './AssistantEvidence';
import { MessageRoleCircle } from './MessageRoleCircle';

export function AgentMessage({
  evidenceExpanded,
  messageById,
  onToggleEvidence,
}: {
  evidenceExpanded: string[];
  messageById: Map<string, ChatMessage>;
  onToggleEvidence: (messageId: string) => void;
}) {
  const messageId = useAuiState((state) => state.message.id);
  const sourceMessage = messageById.get(messageId);
  const messageSources = sourceMessage?.sources ?? [];
  const isExpanded = evidenceExpanded.includes(messageId);

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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{sourceMessage.content}</ReactMarkdown>
        ) : (
          <MessagePrimitive.Parts />
        )}
        <AssistantEvidence
          expanded={isExpanded}
          messageId={messageId}
          onToggle={onToggleEvidence}
          sources={messageSources}
        />
      </div>
    </MessagePrimitive.Root>
  );
}
