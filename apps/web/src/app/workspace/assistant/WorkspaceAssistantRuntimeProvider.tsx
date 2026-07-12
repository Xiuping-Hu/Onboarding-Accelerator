import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react';
import type { AppendMessage, ExternalStoreThreadListAdapter } from '@assistant-ui/react';
import type { ChatMessage, OnboardingSession } from '@onboarding/shared';
import type { ReactNode } from 'react';
import { getAppendMessageText, toAssistantMessage } from './assistantMessageMapping';
import { toPlanThreads } from '../workspaceThreadModel';

export function WorkspaceAssistantRuntimeProvider({
  activeSessionId,
  children,
  isLoading,
  isRunning,
  messages,
  onCreatePlan,
  onDeletePlan,
  onSelectPlan,
  onSendMessage,
  sessions,
}: {
  activeSessionId: string | null;
  children: ReactNode;
  isLoading: boolean;
  isRunning: boolean;
  messages: ChatMessage[];
  onCreatePlan: () => Promise<void>;
  onDeletePlan: (sessionId: string) => Promise<void>;
  onSelectPlan: (sessionId: string) => Promise<void>;
  onSendMessage: (message: string) => Promise<void>;
  sessions: OnboardingSession[];
}) {
  const threadList: ExternalStoreThreadListAdapter = {
    threadId: activeSessionId ?? undefined,
    isLoading,
    threads: toPlanThreads(sessions),
    onSwitchToNewThread: onCreatePlan,
    onSwitchToThread: onSelectPlan,
    onDelete: onDeletePlan,
  };

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    isDisabled: !activeSessionId,
    isSendDisabled: isRunning,
    convertMessage: toAssistantMessage,
    adapters: { threadList },
    onNew: async (message: AppendMessage) => {
      const text = getAppendMessageText(message);
      if (text.length > 0) {
        await onSendMessage(text);
      }
    },
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
