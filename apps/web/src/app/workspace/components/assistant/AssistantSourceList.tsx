import React, { type RefObject } from 'react';
import type { DisplaySourceLink } from '@/features/workspace/sourceLinks';

export function AssistantSourceList({
  firstLinkRef,
  lastLinkRef,
  links,
  onSelect,
}: {
  firstLinkRef: RefObject<HTMLAnchorElement | null>;
  lastLinkRef: RefObject<HTMLAnchorElement | null>;
  links: DisplaySourceLink[];
  onSelect: () => void;
}) {
  return (
    <ul className="mt-2 grid max-h-72 list-none gap-0 overflow-y-auto p-0">
      {links.map((source, index) => (
        <li className="border-t border-workspace-border first:border-t-0" key={source.id}>
          <a
            className="grid gap-0.5 rounded-lg px-2 py-2.5 text-inherit no-underline hover:bg-workspace-assistant-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            href={source.href}
            onClick={onSelect}
            ref={(element) => {
              if (index === 0) firstLinkRef.current = element;
              if (index === links.length - 1) lastLinkRef.current = element;
            }}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="text-[10px] font-bold tracking-wide text-workspace-assistant uppercase">
              {source.label}
            </span>
            <strong className="text-xs">{source.title}</strong>
            {source.excerpt ? (
              <span className="line-clamp-2 text-[11px] leading-relaxed text-workspace-muted">
                {source.excerpt}
              </span>
            ) : null}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
