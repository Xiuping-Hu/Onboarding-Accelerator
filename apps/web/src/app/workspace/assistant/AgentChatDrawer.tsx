import { useMemo, useState } from 'react';
import type { ChatMessage } from '@onboarding/shared';
import { AgentChatRuntimeProvider } from './AgentChatRuntimeProvider';
import { AgentComposer } from './AgentComposer';
import { AgentThread } from './AgentThread';

export function AgentChatDrawer({
  isRunning,
  messages,
  onSendMessage,
  onToggleWebSearch,
  webSearchEnabled,
}: {
  isRunning: boolean;
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  onToggleWebSearch: () => void;
  webSearchEnabled: boolean;
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
    <AgentChatRuntimeProvider
      isRunning={isRunning}
      messages={messages}
      onSendMessage={onSendMessage}
    >
      <section className="chat-panel">
        <div className="panel-heading">
          <p className="eyebrow">Agent drawer</p>
          <h2>Ask, locate, focus</h2>
        </div>
        <AgentThread
          evidenceExpanded={expandedEvidenceIds}
          messageById={messageById}
          onToggleEvidence={toggleEvidence}
        />
        {isRunning ? <div className="assistant-thinking">Thinking...</div> : null}
        <AgentComposer
          onToggleWebSearch={onToggleWebSearch}
          webSearchEnabled={webSearchEnabled}
        />
      </section>
    </AgentChatRuntimeProvider>
  );
}
