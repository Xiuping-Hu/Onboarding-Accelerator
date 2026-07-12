import { useMemo, useState } from 'react';
import type { ChatMessage } from '@onboarding/shared';
import { AgentThread } from './AgentThread';

export function AgentChatDrawer({
  isRunning,
  messages,
  userLabel,
}: {
  isRunning: boolean;
  messages: ChatMessage[];
  userLabel: string;
}) {
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<string[]>([]);
  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  function toggleEvidence(messageId: string) {
    setExpandedEvidenceIds((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId],
    );
  }

  return (
    <section className="chat-panel">
      <div className="panel-heading">
        <h2>Onboarding assistant</h2>
        <p>Ask questions and build your onboarding plan.</p>
      </div>
      <AgentThread
        evidenceExpanded={expandedEvidenceIds}
        messageById={messageById}
        onToggleEvidence={toggleEvidence}
        userLabel={userLabel}
      />
      {isRunning ? (
        <div aria-live="polite" className="assistant-thinking" role="status">
          Onboarding assistant is thinking...
        </div>
      ) : null}
    </section>
  );
}
