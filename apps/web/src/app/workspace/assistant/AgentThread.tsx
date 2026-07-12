import { ThreadPrimitive } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import { AgentMessage } from './AgentMessage';
import { AgentComposer } from './AgentComposer';
import { UserMessage } from './UserMessage';

export function AgentThread({
  evidenceExpanded,
  messageById,
  onToggleEvidence,
  userLabel,
}: {
  evidenceExpanded: string[];
  messageById: Map<string, ChatMessage>;
  onToggleEvidence: (messageId: string) => void;
  userLabel: string;
}) {
  const components = {
    AssistantMessage: () => (
      <AgentMessage
        evidenceExpanded={evidenceExpanded}
        messageById={messageById}
        onToggleEvidence={onToggleEvidence}
      />
    ),
    UserMessage: () => <UserMessage userLabel={userLabel} />,
  };

  return (
    <ThreadPrimitive.Root className="agent-thread">
      <ThreadPrimitive.Viewport className="message-list">
        <ThreadPrimitive.Empty>
          <div className="assistant-welcome">
            <h3>What would you like help with?</h3>
            <p>Ask about your role, team, tools, or next steps.</p>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={components} />
        <ThreadPrimitive.ViewportFooter className="thread-composer-footer">
          <ThreadPrimitive.ScrollToBottom className="scroll-to-bottom" type="button">
            Latest messages
          </ThreadPrimitive.ScrollToBottom>
          <AgentComposer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
