import { MessagePrimitive } from '@assistant-ui/react';
import { MessageRoleCircle } from './MessageRoleCircle';

export function UserMessage({ userLabel }: { userLabel: string }) {
  return (
    <MessagePrimitive.Root className="message user" data-role="user">
      <div className="message-bubble">
        <span className="sr-only">You</span>
        <MessagePrimitive.Parts />
      </div>
      <MessageRoleCircle label={userLabel} role="user" />
    </MessagePrimitive.Root>
  );
}
