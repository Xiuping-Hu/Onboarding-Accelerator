import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import type { ChatMessage } from '@onboarding/shared';
import { MessageRoleCircle } from './MessageRoleCircle';

export function UserMessage({
  messageById,
  userLabel,
}: {
  messageById: Map<string, ChatMessage>;
  userLabel: string;
}) {
  const messageId = useAuiState((state) => state.message.id);
  const references = messageById.get(messageId)?.roadmapReferences ?? [];

  return (
    <MessagePrimitive.Root
      className="flex w-full min-w-0 max-w-full items-end justify-end gap-2"
      data-role="user"
    >
      <div className="min-w-0 max-w-[calc(100%-36px)] rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-slate-700 [overflow-wrap:anywhere] [&_p]:m-0 [&_p]:leading-relaxed">
        <span className="sr-only">You</span>
        {references.map((reference) => (
          <small className="mb-1.5 block font-bold text-indigo-700" key={reference.nodeId}>
            Roadmap: {reference.title}
          </small>
        ))}
        <MessagePrimitive.Parts />
      </div>
      <MessageRoleCircle label={userLabel} role="user" />
    </MessagePrimitive.Root>
  );
}
