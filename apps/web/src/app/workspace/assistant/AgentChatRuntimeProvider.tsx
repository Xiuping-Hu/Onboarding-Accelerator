import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react';
import type { AppendMessage } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import type { ReactNode } from 'react';
import { getAppendMessageText, toAssistantMessage } from './assistantMessageMapping';

export function AgentChatRuntimeProvider({
  children,
  isRunning,
  messages,
  onSendMessage,
}: {
  children: ReactNode;
  isRunning: boolean;
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
}) {
  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    isSendDisabled: isRunning,
    convertMessage: toAssistantMessage,
    onNew: async (message: AppendMessage) => {
      const text = getAppendMessageText(message);
      if (text.length > 0) {
        await onSendMessage(text);
      }
    },
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
