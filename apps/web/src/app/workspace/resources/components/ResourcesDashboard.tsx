'use client';

import { FileTextIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceRoute } from '../../components/WorkspaceRouteContext';
import { deriveWorkspaceResources } from '@/features/workspace/workspaceDashboardModel';
import { ResourceCard, resourceCardClass } from './ResourceCard';

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
          className={`${resourceCardClass} grid min-h-52 grid-cols-[64px_minmax(0,1fr)] items-center gap-5 p-7 max-md:min-h-0 max-md:grid-cols-1 max-md:p-5`}
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
      {resources.items.map((resource) => (
        <ResourceCard key={resource.id} resource={resource} />
      ))}
    </ul>
  );
}

function ResourceSkeleton() {
  return (
    <div className={`${resourceCardClass} grid gap-3 p-5`}>
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}
