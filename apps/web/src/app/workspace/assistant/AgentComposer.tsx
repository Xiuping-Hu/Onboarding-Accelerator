import { ComposerPrimitive } from '@assistant-ui/react';
import type { GuideStep } from '@onboarding/shared';

export function AgentComposer({
  onAddReference,
  onRemoveReference,
  referenceCandidate,
  referencedStep,
}: {
  onAddReference: () => void;
  onRemoveReference: () => void;
  referenceCandidate: GuideStep | null;
  referencedStep: GuideStep | null;
}) {
  return (
    <>
      <div className="roadmap-reference-control">
        {referencedStep ? (
          <div className="roadmap-reference-chip">
            <span>
              <small>Roadmap reference</small>
              <strong>{referencedStep.title}</strong>
            </span>
            <button
              aria-label={`Remove ${referencedStep.title} reference`}
              onClick={onRemoveReference}
              type="button"
            >
              &times;
            </button>
          </div>
        ) : referenceCandidate ? (
          <button className="roadmap-reference-add" onClick={onAddReference} type="button">
            + Reference selected node: {referenceCandidate.title}
          </button>
        ) : (
          <small>Select a roadmap node to add it as chat context.</small>
        )}
      </div>
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
    </>
  );
}
