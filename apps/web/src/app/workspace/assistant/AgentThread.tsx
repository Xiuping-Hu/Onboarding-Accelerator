import { ThreadPrimitive } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import { useMemo } from 'react';
import { AgentMessage } from './AgentMessage';
import { UserMessage } from './UserMessage';

export function AgentThread({
  evidenceExpanded,
  messageById,
  onToggleEvidence,
  onTypingComplete,
  typingMessageId,
  userLabel,
}: {
  evidenceExpanded: string[];
  messageById: Map<string, ChatMessage>;
  onToggleEvidence: (messageId: string) => void;
  onTypingComplete: (messageId: string) => void;
  typingMessageId: string | null;
  userLabel: string;
}) {
  const components = useMemo(
    () => ({
      AssistantMessage: () => (
        <AgentMessage
          evidenceExpanded={evidenceExpanded}
          messageById={messageById}
          onToggleEvidence={onToggleEvidence}
          onTypingComplete={onTypingComplete}
          typingMessageId={typingMessageId}
        />
      ),
      UserMessage: () => <UserMessage messageById={messageById} userLabel={userLabel} />,
    }),
    [evidenceExpanded, messageById, onToggleEvidence, onTypingComplete, typingMessageId, userLabel],
  );

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
        <ThreadPrimitive.ViewportFooter className="thread-scroll-footer">
          <ThreadPrimitive.ScrollToBottom className="scroll-to-bottom" type="button">
            Latest messages
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
