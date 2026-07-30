import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, GuideStep } from '@onboarding/shared';
import { AgentComposer } from './AgentComposer';
import { AgentThread } from './AgentThread';

export function AgentChatDrawer({
  isRunning,
  canSend,
  messages,
  onAddReference,
  onMinimize,
  onRemoveReference,
  onSendSuggestion,
  referenceCandidate,
  referencedStep,
  userLabel,
}: {
  canSend: boolean;
  isRunning: boolean;
  messages: ChatMessage[];
  onAddReference: () => void;
  onMinimize: () => void;
  onRemoveReference: () => void;
  onSendSuggestion: (message: string) => Promise<void>;
  referenceCandidate: GuideStep | null;
  referencedStep: GuideStep | null;
  userLabel: string;
}) {
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

  const finishTyping = useCallback((messageId: string) => {
    setTypingMessageId((current) => (current === messageId ? null : current));
  }, []);

  return (
    <section className="chat-panel">
      <div className="panel-heading">
        <div className="assistant-heading-title">
          <AssistantSparkleIcon />
          <h2>Onboarding Assistant</h2>
        </div>
        <button
          aria-controls="onboarding-assistant-content"
          aria-expanded="true"
          aria-label="Minimize onboarding assistant"
          className="assistant-minimize-button"
          onClick={onMinimize}
          type="button"
        >
          <span aria-hidden="true" />
        </button>
        <p>Ask questions and build your onboarding plan.</p>
      </div>
      <div className="assistant-card-content">
        <AgentThread
          messageById={messageById}
          onTypingComplete={finishTyping}
          typingMessageId={typingMessageId}
          userLabel={userLabel}
        />
        <div className="assistant-suggestions" aria-label="Suggested questions">
          {suggestedQuestions.map((question) => (
            <button
              disabled={isRunning || !canSend}
              key={question}
              onClick={() => void onSendSuggestion(question)}
              type="button"
            >
              {question}
            </button>
          ))}
        </div>
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
          <p className="assistant-disclaimer">
            AI-generated responses may be inaccurate. Verify important information.
          </p>
        </div>
      </div>
    </section>
  );
}

const suggestedQuestions = [
  'What should I focus on next?',
  'Which resources can help me?',
  'Show me my current onboarding stage',
];

function AssistantSparkleIcon() {
  return (
    <svg aria-hidden="true" className="assistant-heading-icon" fill="none" viewBox="0 0 20 20">
      <path
        d="m8.5 2 .9 2.6 2.6.9-2.6.9L8.5 9l-.9-2.6L5 5.5l2.6-.9L8.5 2ZM14.5 9l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM5 11l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}
