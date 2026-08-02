'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '@onboarding/shared';

export function useAssistantTypingMessage(messages: ChatMessage[], isRunning: boolean) {
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

  return { finishTyping, messageById, typingMessageId };
}
