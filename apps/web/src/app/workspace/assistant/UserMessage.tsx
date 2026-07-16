import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import { MessageRoleCircle } from './MessageRoleCircle';

export function UserMessage({
  messageById,
  userLabel,
}: {
  messageById: Map<string, ChatMessage>;
  userLabel: string;
}) {
  const messageId = useAuiState((state) => state.message.id);
  const references = messageById.get(messageId)?.roadmapReferences ?? [];

  return (
    <MessagePrimitive.Root className="message user" data-role="user">
      <div className="message-bubble">
        <span className="sr-only">You</span>
        {references.map((reference) => (
          <small className="message-roadmap-reference" key={reference.nodeId}>
            Roadmap: {reference.title}
          </small>
        ))}
        <MessagePrimitive.Parts />
      </div>
      <MessageRoleCircle label={userLabel} role="user" />
    </MessagePrimitive.Root>
  );
}
