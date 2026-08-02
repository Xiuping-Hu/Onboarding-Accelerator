import React, { type MouseEvent } from 'react';
import type { WorkspaceRoadmapState } from '@/features/workspace/workspaceDashboardModel';
import { cn } from '@/lib/utils';
import { DashboardEmptyState, DashboardSkeleton, dashboardCardClass } from './DashboardState';
import { RoadmapStageCard } from './RoadmapStageCard';

export function RoadmapSection({
  isLoading,
  onReferenceStep,
  roadmap,
}: {
  isLoading: boolean;
  onReferenceStep: (stepId: string) => void;
  roadmap: WorkspaceRoadmapState;
}) {
  if (isLoading && roadmap.status === 'unavailable') {
    return <DashboardSkeleton ariaLabel="Loading onboarding roadmap" />;
  }

  return (
    <section aria-labelledby="onboarding-roadmap">
      <h2
        className="m-0 text-base font-bold text-workspace-heading outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring"
        id="onboarding-roadmap"
        tabIndex={-1}
      >
        Onboarding Roadmap
      </h2>
      {roadmap.status === 'partial' ? (
        <p
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          role="status"
        >
          Some roadmap stages are temporarily unavailable.
        </p>
      ) : null}
      {roadmap.stages.length > 0 ? (
        <ol className="mt-4 grid list-none gap-3 p-0">
          {roadmap.stages.map((stage) => (
            <RoadmapStageCard key={stage.id} onReferenceStep={onReferenceStep} stage={stage} />
          ))}
        </ol>
      ) : (
        <div className={cn(dashboardCardClass, 'mt-4')}>
          <DashboardEmptyState
            description={
              roadmap.status === 'empty'
                ? 'A published roadmap will show your onboarding stages here.'
                : 'The roadmap could not be loaded. Try again from the workspace status message.'
            }
            title={roadmap.status === 'empty' ? 'No roadmap available' : 'Roadmap unavailable'}
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
