import React, { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { KnowledgeSource } from '@onboarding/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/common/overlays/Popover';
import { Button } from '@/components/ui/button';
import { getDisplaySourceState } from '@/features/workspace/sourceLinks';

export function AssistantSourcesPopover({
  sources,
  unavailable = false,
}: {
  sources: KnowledgeSource[];
  unavailable?: boolean;
}) {
  const state = getDisplaySourceState(sources);
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const contentId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const lastLinkRef = useRef<HTMLAnchorElement>(null);
  const focusAfterCloseRef = useRef<HTMLElement | null>(null);

  if (state.status === 'empty' && !unavailable) {
    return null;
  }

  if (state.status === 'error' || unavailable) {
    return (
      <div className="assistant-source-error" role="status">
        Sources are temporarily unavailable.
      </div>
    );
  }

  const count = state.links.length;
  const sourceLabel = `${count} source${count === 1 ? '' : 's'}`;

  return (
    <div className="assistant-sources">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-controls={contentId}
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${sourceLabel} for this response`}
            className="assistant-sources-trigger"
            ref={triggerRef}
            size="icon"
            type="button"
            variant="ghost"
          >
            <SourceIcon />
            <span aria-hidden="true" className="assistant-sources-count">
              {count}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-labelledby={headingId}
          className="assistant-sources-popover"
          collisionPadding={12}
          id={contentId}
          onCloseAutoFocus={(event: Event) => {
            const focusTarget = focusAfterCloseRef.current;
            if (!focusTarget) return;
            event.preventDefault();
            focusAfterCloseRef.current = null;
            focusTarget.focus();
          }}
          onKeyDown={(event) =>
            handlePopoverTab(
              event,
              triggerRef.current,
              firstLinkRef.current,
              lastLinkRef.current,
              (target) => {
                focusAfterCloseRef.current = target;
                setOpen(false);
              },
            )
          }
          onOpenAutoFocus={(event: Event) => {
            event.preventDefault();
            firstLinkRef.current?.focus();
          }}
          side="top"
        >
          <h3 className="assistant-sources-heading" id={headingId}>
            Sources for this response
          </h3>
          <ul className="assistant-sources-list">
            {state.links.map((source, index) => (
              <li key={source.id}>
                <a
                  className="assistant-source-link"
                  href={source.href}
                  onClick={() => setOpen(false)}
                  ref={(element) => {
                    if (index === 0) firstLinkRef.current = element;
                    if (index === state.links.length - 1) lastLinkRef.current = element;
                  }}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="assistant-source-link-label">{source.label}</span>
                  <strong>{source.title}</strong>
                  {source.excerpt ? (
                    <span className="assistant-source-link-excerpt">{source.excerpt}</span>
                  ) : null}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function handlePopoverTab(
  event: KeyboardEvent,
  trigger: HTMLElement | null,
  firstLink: HTMLElement | null,
  lastLink: HTMLElement | null,
  closeAndFocus: (target: HTMLElement) => void,
): void {
  if (event.key !== 'Tab' || !trigger) return;

  if (event.shiftKey && event.target === firstLink) {
    event.preventDefault();
    closeAndFocus(trigger);
    return;
  }

  if (!event.shiftKey && event.target === lastLink) {
    const next = getNextFocusableElement(trigger);
    if (!next) return;
    event.preventDefault();
    closeAndFocus(next);
  }
}

function getNextFocusableElement(current: HTMLElement): HTMLElement | null {
  const focusable = [
    ...document.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => !element.closest('[hidden]'));
  const currentIndex = focusable.indexOf(current);
  return currentIndex >= 0 ? (focusable[currentIndex + 1] ?? null) : null;
}

function SourceIcon() {
  return (
    <svg aria-hidden="true" className="assistant-sources-icon" fill="none" viewBox="0 0 20 20">
      <path
        d="M7.75 6.25h-1.5A3.25 3.25 0 0 0 3 9.5v1a3.25 3.25 0 0 0 3.25 3.25h1.5m4.5-7.5h1.5A3.25 3.25 0 0 1 17 9.5v1a3.25 3.25 0 0 1-3.25 3.25h-1.5M7 10h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
