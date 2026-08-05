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
                ? 'Activate an approved onboarding plan to see its roadmap stages here.'
                : 'The onboarding roadmap could not be loaded. Try again from the workspace status message.'
            }
            title={roadmap.status === 'empty' ? 'No active plan' : 'Roadmap unavailable'}
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
