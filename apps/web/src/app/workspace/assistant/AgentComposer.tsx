import { ComposerPrimitive } from '@assistant-ui/react';

export function AgentComposer({
  webSearchEnabled,
  onToggleWebSearch,
}: {
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
}) {
  return (
    <ComposerPrimitive.Root className="chat-form">
      <ComposerPrimitive.Input
        aria-label="Message assistant"
        placeholder="Ask for the next action, visual location, or a plain-English answer."
        submitMode="enter"
      />
      <button
        aria-pressed={webSearchEnabled}
        className={`web-search-button ${webSearchEnabled ? 'active' : ''}`}
        onClick={onToggleWebSearch}
        type="button"
      >
        Web
      </button>
      <ComposerPrimitive.Send className="primary-button">Send</ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}
