import { ComposerPrimitive } from '@assistant-ui/react';

export function AgentComposer() {
  return (
    <ComposerPrimitive.Root className="chat-form">
      <ComposerPrimitive.Input
        aria-label="Message assistant"
        className="chat-input"
        placeholder="Ask for the next action, visual location, or a plain-English answer."
        style={{ resize: 'none' }}
        submitMode="enter"
      />
      <ComposerPrimitive.Send className="primary-button">Send</ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}
