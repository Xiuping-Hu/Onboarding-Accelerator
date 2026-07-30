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
          <small>Choose a roadmap stage to add it as chat context.</small>
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
        <ComposerPrimitive.Send aria-label="Send message" className="chat-send-button">
          <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
            <path
              d="m3 9.25 13.5-5.5-4.75 12.5-2.2-5-6.55-2Zm6.55 2L16.5 3.75"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
          <span className="sr-only">Send message</span>
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </>
  );
}
