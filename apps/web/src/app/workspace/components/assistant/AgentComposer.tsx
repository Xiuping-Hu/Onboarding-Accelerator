import { ComposerPrimitive } from '@assistant-ui/react';
import { SendIcon, XIcon } from 'lucide-react';
import type { GuideStep } from '@onboarding/shared';
import { Button } from '@/components/ui/button';

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
      <div className="min-w-0 text-[11px] text-workspace-muted">
        {referencedStep ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1.5 text-indigo-800">
            <span className="grid min-w-0">
              <small className="truncate">Roadmap reference</small>
              <strong className="truncate">{referencedStep.title}</strong>
            </span>
            <Button
              aria-label={`Remove ${referencedStep.title} reference`}
              className="size-7 shrink-0 rounded-full text-indigo-800 hover:bg-indigo-100"
              onClick={onRemoveReference}
              size="icon"
              type="button"
              variant="ghost"
            >
              <XIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ) : referenceCandidate ? (
          <button
            className="max-w-full truncate rounded-lg border border-dashed border-indigo-300 bg-indigo-50/60 px-2 py-1.5 text-left text-indigo-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={onAddReference}
            type="button"
          >
            + Reference selected node: {referenceCandidate.title}
          </button>
        ) : (
          <small>Choose a roadmap stage to add it as chat context.</small>
        )}
      </div>
      <ComposerPrimitive.Root className="grid min-w-0 grid-cols-[minmax(0,1fr)_42px] items-end gap-2">
        <ComposerPrimitive.Input
          aria-label="Message the onboarding assistant"
          className="min-h-18 max-h-28.5 w-full min-w-0 resize-none rounded-lg border border-input bg-white p-3 leading-snug text-slate-800 outline-none focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
          placeholder="Ask about your role, team, tools, or next steps"
          submitMode="enter"
        />
        <ComposerPrimitive.Send
          aria-label="Send message"
          className="grid size-10.5 place-items-center rounded-lg border-0 bg-workspace-assistant text-white hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          <SendIcon aria-hidden="true" className="size-5" />
          <span className="sr-only">Send message</span>
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </>
  );
}
