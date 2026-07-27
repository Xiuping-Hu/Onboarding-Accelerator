import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const seenMessageIds = useRef<Set<string> | null>(null);
  const wasRunning = useRef(isRunning);
  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  useEffect(() => {
    if (seenMessageIds.current === null) {
      seenMessageIds.current = new Set(messages.map((message) => message.id));
      wasRunning.current = isRunning;
      return;
    }

    const newAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && !seenMessageIds.current?.has(message.id));
    const shouldAnimate = isRunning || wasRunning.current;

    seenMessageIds.current = new Set(messages.map((message) => message.id));
    wasRunning.current = isRunning;

    if (newAssistantMessage && shouldAnimate) {
      setTypingMessageId(newAssistantMessage.id);
    } else if (typingMessageId && !messages.some((message) => message.id === typingMessageId)) {
      setTypingMessageId(null);
    }
  }, [isRunning, messages, typingMessageId]);

  const toggleEvidence = useCallback(function toggleEvidence(messageId: string) {
    setExpandedEvidenceIds((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId],
    );
  }, []);

  const finishTyping = useCallback((messageId: string) => {
    setTypingMessageId((current) => (current === messageId ? null : current));
  }, []);

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
        onTypingComplete={finishTyping}
        typingMessageId={typingMessageId}
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
