import { ComposerPrimitive } from '@assistant-ui/react';

export function AgentComposer() {
  return (
    <ComposerPrimitive.Root className="chat-form">
      <ComposerPrimitive.Input
        aria-label="Message the onboarding assistant"
        className="chat-input"
        placeholder="Ask about your role, team, tools, or next steps"
        style={{ resize: 'none' }}
        submitMode="enter"
      />
      <ComposerPrimitive.Send className="primary-button">Send</ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}
