import React from 'react';
import { ExternalLinkIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DisplaySourceLink } from '@/features/workspace/sourceLinks';

export const resourceCardClass =
  'min-w-0 rounded-xl border border-workspace-border bg-white shadow-[0_5px_18px_rgb(31_38_61_/_5%)]';

export function ResourceCard({ resource }: { resource: DisplaySourceLink }) {
  const isExternal = /^https?:\/\//i.test(resource.href);

  return (
    <li className={`${resourceCardClass} flex min-h-44 flex-col p-5`}>
      <Badge
        className="mb-3 bg-workspace-assistant-soft text-workspace-assistant"
        variant="secondary"
      >
        {resource.label}
      </Badge>
      <h2 className="m-0 text-base font-bold text-workspace-heading">{resource.title}</h2>
      {resource.excerpt ? (
        <p className="mt-2 mb-4 line-clamp-3 text-sm leading-relaxed text-workspace-muted">
          {resource.excerpt}
        </p>
      ) : null}
      <a
        className="mt-auto inline-flex items-center gap-1 self-start text-sm font-semibold text-workspace-assistant hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href={resource.href}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        target={isExternal ? '_blank' : undefined}
      >
        Open resource
        {isExternal ? <span className="sr-only"> (opens in a new tab)</span> : null}
        <ExternalLinkIcon aria-hidden="true" className="size-4" />
      </a>
    </li>
  );
}
