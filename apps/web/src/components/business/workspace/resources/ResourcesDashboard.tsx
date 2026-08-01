'use client';

import { ExternalLinkIcon, FileTextIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceRoute } from '@/components/business/workspace/WorkspaceRouteContext';
import { deriveWorkspaceResources } from '@/features/workspace/workspaceDashboardModel';

const cardClass =
  'min-w-0 rounded-xl border border-workspace-border bg-white shadow-[0_5px_18px_rgb(31_38_61_/_5%)]';

export function ResourcesDashboard() {
  const { graph, isLoading, sources } = useWorkspaceRoute();
  const resources = useMemo(
    () => deriveWorkspaceResources(graph ? { ...graph, sources } : null),
    [graph, sources],
  );

  if (isLoading && resources.status === 'unavailable') {
    return (
      <div
        aria-label="Loading onboarding resources"
        className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 pb-2"
        role="status"
      >
        <ResourceSkeleton />
        <ResourceSkeleton />
        <ResourceSkeleton />
      </div>
    );
  }

  if (resources.status !== 'ready') {
    return (
      <section aria-labelledby="resources-content-heading" className="pb-2">
        <div
          className={`${cardClass} grid min-h-52 grid-cols-[64px_minmax(0,1fr)] items-center gap-5 p-7 max-md:min-h-0 max-md:grid-cols-1 max-md:p-5`}
        >
          <div
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-xl bg-workspace-assistant-soft text-workspace-assistant"
          >
            <FileTextIcon className="size-7" />
          </div>
          <div>
            <h2
              className="m-0 text-lg font-bold text-workspace-heading"
              id="resources-content-heading"
            >
              {resources.status === 'empty' ? 'No resources available' : 'Resources unavailable'}
            </h2>
            <p className="mt-2 mb-0 max-w-2xl text-sm leading-relaxed text-workspace-muted">
              {resources.status === 'empty'
                ? 'Authorized resources attached to your onboarding roadmap will appear here.'
                : 'Resource links could not be safely resolved. No internal source locations have been exposed.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <ul
      aria-label="Onboarding resources"
      className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-0 pb-2 max-lg:grid-cols-1"
    >
      {resources.items.map((resource) => {
        const isExternal = /^https?:\/\//i.test(resource.href);
        return (
          <li className={`${cardClass} flex min-h-44 flex-col p-5`} key={resource.id}>
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
      })}
    </ul>
  );
}

function ResourceSkeleton() {
  return (
    <div className={`${cardClass} grid gap-3 p-5`}>
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}
