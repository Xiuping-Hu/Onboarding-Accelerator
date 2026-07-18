import { useMemo, useState } from 'react';
import type { ChatMessage, GuideStep } from '@onboarding/shared';
import { AgentComposer } from './AgentComposer';
import { AgentThread } from './AgentThread';

export function AgentChatDrawer({
  isRunning,
  messages,
  onAddReference,
  onRemoveReference,
  referenceCandidate,
  referencedStep,
  userLabel,
}: {
  isRunning: boolean;
  messages: ChatMessage[];
  onAddReference: () => void;
  onRemoveReference: () => void;
  referenceCandidate: GuideStep | null;
  referencedStep: GuideStep | null;
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
      <div className="chat-composer-area">
        {isRunning ? (
          <div aria-live="polite" className="assistant-thinking" role="status">
            Onboarding assistant is thinking...
          </div>
        ) : null}
        <AgentComposer
          onAddReference={onAddReference}
          onRemoveReference={onRemoveReference}
          referenceCandidate={referenceCandidate}
          referencedStep={referencedStep}
        />
      </div>
    </section>
  );
}
