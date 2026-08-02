import React, { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { KnowledgeSource } from '@onboarding/shared';
import { LinkIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { getDisplaySourceState } from '@/features/workspace/sourceLinks';
import { AssistantSourceList } from './AssistantSourceList';

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
      <div className="mt-2 text-xs font-semibold text-red-700" role="status">
        Sources are temporarily unavailable.
      </div>
    );
  }

  const count = state.links.length;
  const sourceLabel = `${count} source${count === 1 ? '' : 's'}`;

  return (
    <div className="mt-2 inline-flex items-center">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-controls={contentId}
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${sourceLabel} for this response`}
            className="relative size-8 rounded-full text-workspace-assistant hover:bg-workspace-assistant-soft"
            ref={triggerRef}
            size="icon"
            type="button"
            variant="ghost"
          >
            <LinkIcon aria-hidden="true" className="size-4" />
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full border border-white bg-workspace-assistant px-1 text-[9px] font-bold text-white"
            >
              {count}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-labelledby={headingId}
          className="z-50 w-[min(320px,calc(100vw-24px))] rounded-xl border border-workspace-border bg-white p-3 text-workspace-heading shadow-xl"
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
          <h3 className="m-0 text-sm font-bold" id={headingId}>
            Sources for this response
          </h3>
          <AssistantSourceList
            firstLinkRef={firstLinkRef}
            lastLinkRef={lastLinkRef}
            links={state.links}
            onSelect={() => setOpen(false)}
          />
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
