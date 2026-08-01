import { ThreadPrimitive } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import { useMemo } from 'react';
import { AgentMessage } from './AgentMessage';
import { UserMessage } from './UserMessage';

export function AgentThread({
  messageById,
  onTypingComplete,
  typingMessageId,
  userLabel,
}: {
  messageById: Map<string, ChatMessage>;
  onTypingComplete: (messageId: string) => void;
  typingMessageId: string | null;
  userLabel: string;
}) {
  const components = useMemo(
    () => ({
      AssistantMessage: () => (
        <AgentMessage
          messageById={messageById}
          onTypingComplete={onTypingComplete}
          typingMessageId={typingMessageId}
        />
      ),
      UserMessage: () => <UserMessage messageById={messageById} userLabel={userLabel} />,
    }),
    [messageById, onTypingComplete, typingMessageId, userLabel],
  );

  return (
    <ThreadPrimitive.Root className="grid min-h-0 min-w-0 w-full">
      <ThreadPrimitive.Viewport className="grid min-h-0 min-w-0 content-start gap-3 overflow-x-hidden overflow-y-auto px-0.5 py-1.5 [scrollbar-width:thin]">
        <ThreadPrimitive.Empty>
          <div className="mx-auto my-8 max-w-64 self-center rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-center">
            <h3 className="m-0 text-sm font-bold text-slate-700">What would you like help with?</h3>
            <p className="mt-1.5 mb-0 text-xs leading-relaxed text-workspace-muted">
              Ask about your role, team, tools, or next steps.
            </p>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={components} />
        <ThreadPrimitive.ViewportFooter className="sticky right-0 bottom-0 left-0 bg-gradient-to-b from-transparent via-white/80 to-white pt-2">
          <ThreadPrimitive.ScrollToBottom
            className="mx-auto mb-1 block rounded-full border-0 bg-workspace-assistant-soft px-2 py-1 text-[10px] font-semibold text-indigo-700 disabled:hidden"
            type="button"
          >
            Latest messages
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
