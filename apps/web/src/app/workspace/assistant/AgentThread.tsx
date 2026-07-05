import { ThreadPrimitive } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import { AgentMessage } from './AgentMessage';

export function AgentThread({
  evidenceExpanded,
  messageById,
  onToggleEvidence,
}: {
  evidenceExpanded: string[];
  messageById: Map<string, ChatMessage>;
  onToggleEvidence: (messageId: string) => void;
}) {
  const components = {
    Message: () => (
      <AgentMessage
        evidenceExpanded={evidenceExpanded}
        messageById={messageById}
        onToggleEvidence={onToggleEvidence}
      />
    ),
  };

  return (
    <ThreadPrimitive.Root className="agent-thread">
      <ThreadPrimitive.Viewport className="message-list">
        <ThreadPrimitive.Messages components={components} />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
