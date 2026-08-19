import React, { type MouseEvent } from 'react';
import type { WorkspaceRoadmapState } from '@/features/workspace/workspaceDashboardModel';
import { cn } from '@/lib/utils';
import { DashboardEmptyState, DashboardSkeleton, dashboardCardClass } from './DashboardState';
import { RoadmapStageCard } from './RoadmapStageCard';

export function RoadmapSection({
  isLoading,
  roadmap,
}: {
  isLoading: boolean;
  roadmap: WorkspaceRoadmapState;
}) {
  if (isLoading && roadmap.status === 'unavailable') {
    return <DashboardSkeleton ariaLabel="Loading onboarding roadmap" />;
  }

  return (
    <section aria-labelledby="onboarding-roadmap">
      <h2
        className="m-0 text-base font-bold text-workspace-heading outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring"
        data-roadmap-version-id={roadmap.status === 'ready' ? roadmap.versionId : undefined}
        id="onboarding-roadmap"
        tabIndex={-1}
      >
        {roadmap.status === 'ready' ? roadmap.title : 'Onboarding Roadmap'}
      </h2>
      {roadmap.status === 'ready' ? (
        <>
          <p className="mt-1 mb-0 text-xs font-semibold text-workspace-muted">
            Version {roadmap.versionNumber}
          </p>
          <ol className="mt-4 grid list-none gap-3 p-0">
            {roadmap.stages.map((stage) => (
              <RoadmapStageCard key={stage.id} stage={stage} />
            ))}
          </ol>
        </>
      ) : roadmap.status === 'empty' ? (
        <div className={cn(dashboardCardClass, 'mt-4')}>
          <DashboardEmptyState description={roadmap.message} title="Roadmap is being prepared" />
        </div>
      ) : (
        <div className={cn(dashboardCardClass, 'mt-4')}>
          <DashboardEmptyState
            description="The onboarding roadmap could not be loaded. Try again from the workspace status message."
            title="Roadmap unavailable"
          />
        </div>
      )}
    </section>
  );
}

export function focusRoadmap(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const heading = document.getElementById('onboarding-roadmap');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  heading?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  heading?.focus({ preventScroll: true });
  window.history.replaceState(null, '', '#onboarding-roadmap');
}
