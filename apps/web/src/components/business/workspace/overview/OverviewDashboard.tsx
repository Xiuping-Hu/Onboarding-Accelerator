'use client';

import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { useMemo, type MouseEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceRoute } from '@/components/business/workspace/WorkspaceRouteContext';
import {
  createWorkspaceDashboardModel,
  type WorkspaceProgressState,
  type WorkspaceRoadmapStage,
  type WorkspaceRoadmapState,
} from '@/features/workspace/workspaceDashboardModel';
import { cn } from '@/lib/utils';

const cardClass =
  'min-w-0 rounded-xl border border-workspace-border bg-workspace-card shadow-[0_5px_18px_rgb(31_38_61_/_5%)]';

const stageStyles: Record<
  WorkspaceRoadmapStage['status'],
  { marker: string; badge: string; card: string }
> = {
  completed: {
    marker: 'border-workspace-success bg-workspace-success text-white',
    badge: 'border-transparent bg-workspace-success-soft text-workspace-success',
    card: 'border-l-4 border-l-workspace-success',
  },
  'in-progress': {
    marker: 'border-workspace-gold bg-workspace-gold text-slate-950',
    badge: 'border-transparent bg-workspace-gold-soft text-amber-800',
    card: 'border-l-4 border-l-workspace-gold',
  },
  upcoming: {
    marker: 'border-slate-300 bg-white text-slate-600',
    badge: 'border-slate-200 bg-slate-50 text-slate-600',
    card: '',
  },
  'status-unavailable': {
    marker: 'border-slate-300 bg-white text-slate-600',
    badge: 'border-slate-200 bg-slate-50 text-slate-600',
    card: '',
  },
};

export function OverviewDashboard() {
  const { graph, isLoading, onReferenceStep } = useWorkspaceRoute();
  const dashboard = useMemo(() => createWorkspaceDashboardModel(graph), [graph]);

  return (
    <div className="grid min-w-0 gap-5 pb-2">
      <ProgressCard isLoading={isLoading} progress={dashboard.progress} />
      <RoadmapSection
        isLoading={isLoading}
        onReferenceStep={onReferenceStep}
        roadmap={dashboard.roadmap}
      />
      <UpcomingTasksCard isLoading={isLoading} />
    </div>
  );
}

function ProgressCard({
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
      <section className={cn(cardClass, 'p-5')} aria-labelledby="progress-heading">
        <h2 className="m-0 text-base font-bold text-workspace-heading" id="progress-heading">
          Onboarding Progress
        </h2>
        <EmptyState
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
    <section className={cn(cardClass, 'p-5')} aria-labelledby="progress-heading">
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
            View roadmap <ArrowRightIcon aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function RoadmapSection({
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
        <div className={cn(cardClass, 'mt-4')}>
          <EmptyState
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

function RoadmapStageCard({
  onReferenceStep,
  stage,
}: {
  onReferenceStep: (stepId: string) => void;
  stage: WorkspaceRoadmapStage;
}) {
  const statusLabel =
    stage.status === 'completed'
      ? 'Completed'
      : stage.status === 'in-progress'
        ? 'In progress'
        : stage.status === 'upcoming'
          ? 'Upcoming'
          : 'Status unavailable';
  const styles = stageStyles[stage.status];

  return (
    <li
      aria-current={stage.status === 'in-progress' ? 'step' : undefined}
      className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 before:absolute before:top-9 before:bottom-[-12px] before:left-[17px] before:w-px before:bg-workspace-border last:before:hidden max-md:grid-cols-[30px_minmax(0,1fr)] max-md:gap-2 max-md:before:left-3.5"
    >
      <span
        aria-hidden="true"
        className={cn(
          'z-10 grid size-9 place-items-center rounded-full border-2 text-sm font-bold max-md:size-7',
          styles.marker,
        )}
      >
        {stage.position}
      </span>
      <article className={cn(cardClass, 'p-4', styles.card)}>
        <div className="flex items-start justify-between gap-3 max-md:flex-col max-md:gap-2">
          <h3 className="m-0 text-sm font-bold text-workspace-heading">{stage.title}</h3>
          <Badge className={styles.badge} variant="outline">
            {statusLabel}
          </Badge>
        </div>
        <p className="mt-2 mb-3 text-sm leading-relaxed text-workspace-muted">
          {stage.description}
        </p>
        <Button
          className="h-auto p-0 text-workspace-assistant hover:bg-transparent hover:underline"
          onClick={() => onReferenceStep(stage.id)}
          type="button"
          variant="ghost"
        >
          Ask assistant about this stage
        </Button>
      </article>
    </li>
  );
}

function UpcomingTasksCard({ isLoading }: { isLoading: boolean }) {
  return (
    <section className={cn(cardClass, 'p-5')} aria-labelledby="upcoming-tasks-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 className="m-0 text-base font-bold text-workspace-heading" id="upcoming-tasks-heading">
          Upcoming Tasks
        </h2>
        <Link
          className="text-sm font-semibold text-workspace-assistant hover:underline"
          href="/workspace/tasks"
        >
          View all
        </Link>
      </div>
      {isLoading ? (
        <div aria-label="Loading upcoming tasks" className="mt-4 grid gap-2" role="status">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ) : (
        <EmptyState
          compact
          description="No tasks or due dates will be inferred from roadmap content."
          title="Task tracking is not connected yet"
        />
      )}
    </section>
  );
}

function DashboardSkeleton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <section aria-label={ariaLabel} className={cn(cardClass, 'grid gap-3 p-5')} role="status">
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </section>
  );
}

function EmptyState({
  compact = false,
  description,
  title,
}: {
  compact?: boolean;
  description: string;
  title: string;
}) {
  return (
    <div className={cn('px-5 py-8 text-center', compact && 'px-0 py-5 text-left')}>
      <strong className="text-sm text-workspace-heading">{title}</strong>
      <p className="mt-1 mb-0 text-sm leading-relaxed text-workspace-muted">{description}</p>
    </div>
  );
}

function focusRoadmap(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const heading = document.getElementById('onboarding-roadmap');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  heading?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  heading?.focus({ preventScroll: true });
  window.history.replaceState(null, '', '#onboarding-roadmap');
}

function getCompletedStageLabel(percentComplete: number) {
  return percentComplete === 100 ? 'All roadmap stages completed' : 'No active stage';
}
