import type { ChatMessage, GuideStep } from '@onboarding/shared';
import { Button } from '@/components/ui/button';
import { AgentChatHeader } from './AgentChatHeader';
import { AgentComposer } from './AgentComposer';
import { AgentThread } from './AgentThread';
import { useAssistantTypingMessage } from './useAssistantTypingMessage';

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
  const { finishTyping, messageById, typingMessageId } = useAssistantTypingMessage(
    messages,
    isRunning,
  );

  return (
    <section className="grid min-h-0 min-w-0 w-full grid-rows-[auto_minmax(0,1fr)] px-4 pt-4.5 pb-3.5 max-md:px-3 max-md:pt-4 max-md:pb-3">
      <AgentChatHeader onMinimize={onMinimize} />
      <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto_auto] gap-2.5 pt-2.5">
        <AgentThread
          messageById={messageById}
          onTypingComplete={finishTyping}
          typingMessageId={typingMessageId}
          userLabel={userLabel}
        />
        <div className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
          {suggestedQuestions.map((question) => (
            <Button
              className="h-auto min-w-0 max-w-full overflow-hidden border-indigo-100 bg-white px-2 py-1.5 text-left text-[11px] font-semibold text-indigo-700 text-ellipsis hover:border-indigo-300 hover:bg-indigo-50 max-md:w-full max-md:whitespace-normal"
              disabled={isRunning || !canSend}
              key={question}
              onClick={() => void onSendSuggestion(question)}
              size="sm"
              type="button"
              variant="outline"
            >
              {question}
            </Button>
          ))}
        </div>
        <div className="grid min-w-0 gap-2 border-t border-workspace-border bg-white pt-2.5">
          {isRunning ? (
            <div
              aria-live="polite"
              className="text-[11px] font-semibold text-workspace-muted"
              role="status"
            >
              Onboarding assistant is thinking...
            </div>
          ) : null}
          <AgentComposer
            onAddReference={onAddReference}
            onRemoveReference={onRemoveReference}
            referenceCandidate={referenceCandidate}
            referencedStep={referencedStep}
          />
          <p className="mt-0.5 mb-0 text-[10px] leading-snug text-slate-500">
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
