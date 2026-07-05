import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import { AssistantEvidence } from './AssistantEvidence';

function formatTokens(value: number) {
  return new Intl.NumberFormat(undefined).format(value);
}

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
  const role = useAuiState((state) => state.message.role);
  const sourceMessage = messageById.get(messageId);
  const messageSources = sourceMessage?.sources ?? [];
  const isExpanded = evidenceExpanded.includes(messageId);

  return (
    <MessagePrimitive.Root className={`message ${role}`}>
      {sourceMessage?.focusStepIds?.length ? (
        <div className="message-header">
          <small>Focused matching guide step.</small>
        </div>
      ) : null}
      <MessagePrimitive.Parts />
      {sourceMessage?.usage ? (
        <div className="message-usage">
          <span>{sourceMessage.usage.model}</span>
          <span>{formatTokens(sourceMessage.usage.totalTokens)} tokens</span>
        </div>
      ) : null}
      {role === 'assistant' ? (
        <AssistantEvidence
          expanded={isExpanded}
          messageId={messageId}
          onToggle={onToggleEvidence}
          sources={messageSources}
        />
      ) : null}
    </MessagePrimitive.Root>
  );
}
