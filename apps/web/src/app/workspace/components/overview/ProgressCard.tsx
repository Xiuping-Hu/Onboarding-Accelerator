import React from 'react';
import type { WorkspaceProgressState } from '@/features/workspace/workspaceDashboardModel';
import { cn } from '@/lib/utils';
import { DashboardEmptyState, DashboardSkeleton, dashboardCardClass } from './DashboardState';
import { focusRoadmap } from './RoadmapSection';

export function ProgressCard({
  isLoading,
  progress,
}: {
  isLoading: boolean;
  progress: WorkspaceProgressState;
}) {
  if (isLoading && progress.status === 'unavailable') {
    return <DashboardSkeleton ariaLabel="Loading onboarding progress" />;
  }

  if (progress.status !== 'ready') {
    return (
      <section className={cn(dashboardCardClass, 'p-5')} aria-labelledby="progress-heading">
        <h2 className="m-0 text-base font-bold text-workspace-heading" id="progress-heading">
          Onboarding Progress
        </h2>
        <DashboardEmptyState
          description={
            progress.status === 'empty'
              ? 'Your progress will appear after an onboarding roadmap is published.'
              : 'Progress cannot be calculated until a complete roadmap is available.'
          }
          title={progress.status === 'empty' ? 'No roadmap yet' : 'Progress unavailable'}
        />
      </section>
    );
  }

  const { summary } = progress;
  return (
    <section className={cn(dashboardCardClass, 'p-5')} aria-labelledby="progress-heading">
      <h2 className="m-0 text-base font-bold text-workspace-heading" id="progress-heading">
        Onboarding Progress
      </h2>
      <div className="mt-5 grid grid-cols-[136px_minmax(0,1fr)] items-center gap-7 max-md:grid-cols-1">
        <div
          aria-label={`${summary.percentComplete}% complete, ${summary.completedStageCount} of ${summary.totalStageCount} stages completed`}
          className="relative size-32 justify-self-center"
          role="img"
        >
          <svg aria-hidden="true" className="size-full -rotate-90" viewBox="0 0 42 42">
            <circle
              className="fill-none stroke-slate-200"
              cx="21"
              cy="21"
              pathLength="100"
              r="16"
              strokeWidth="4"
            />
            <circle
              className="fill-none stroke-workspace-gold transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
              cx="21"
              cy="21"
              pathLength="100"
              r="16"
              strokeDasharray="100"
              strokeDashoffset={100 - summary.percentComplete}
              strokeLinecap="round"
              strokeWidth="4"
            />
          </svg>
          <span className="absolute inset-0 grid place-content-center text-center">
            <strong className="text-2xl text-workspace-heading">{summary.percentComplete}%</strong>
            <small className="text-[10px] font-semibold tracking-wide text-workspace-muted uppercase">
              Complete
            </small>
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-xs font-bold tracking-wide text-workspace-muted uppercase">
            Current Stage
          </span>
          <strong className="mt-1 block text-lg text-workspace-heading">
            {summary.currentStage?.title ?? getCompletedStageLabel(summary.percentComplete)}
          </strong>
          <p className="mt-2 mb-3 leading-relaxed text-workspace-muted">
            {summary.currentStage?.description ??
              'The roadmap does not currently identify a stage in progress.'}
          </p>
          <a
            className="inline-flex items-center gap-1 font-semibold text-workspace-assistant underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            href="#onboarding-roadmap"
            onClick={focusRoadmap}
          >
            View roadmap <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function getCompletedStageLabel(percentComplete: number) {
  return percentComplete === 100 ? 'All roadmap stages completed' : 'No active stage';
}
