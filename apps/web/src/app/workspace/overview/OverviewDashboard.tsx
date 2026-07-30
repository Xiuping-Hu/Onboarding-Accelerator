'use client';

import { useMemo, type CSSProperties, type MouseEvent } from 'react';
import Link from 'next/link';
import {
  createWorkspaceDashboardModel,
  type WorkspaceProgressState,
  type WorkspaceRoadmapStage,
  type WorkspaceRoadmapState,
} from '@/features/workspace/workspaceDashboardModel';
import { useWorkspaceRoute } from '../WorkspaceRouteContext';

export function OverviewDashboard() {
  const { graph, isLoading, onReferenceStep } = useWorkspaceRoute();
  const dashboard = useMemo(() => createWorkspaceDashboardModel(graph), [graph]);

  return (
    <div className="overview-dashboard">
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
    return <DashboardSkeleton ariaLabel="Loading onboarding progress" className="progress-card" />;
  }

  if (progress.status !== 'ready') {
    return (
      <section className="dashboard-card progress-card" aria-labelledby="progress-heading">
        <h2 id="progress-heading">Onboarding Progress</h2>
        <div className="dashboard-empty-state">
          <strong>{progress.status === 'empty' ? 'No roadmap yet' : 'Progress unavailable'}</strong>
          <p>
            {progress.status === 'empty'
              ? 'Your progress will appear after an onboarding roadmap is published.'
              : 'Progress cannot be calculated until a complete roadmap is available.'}
          </p>
        </div>
      </section>
    );
  }

  const { summary } = progress;
  const ringStyle = { '--progress-value': `${summary.percentComplete * 3.6}deg` } as CSSProperties;

  return (
    <section className="dashboard-card progress-card" aria-labelledby="progress-heading">
      <h2 id="progress-heading">Onboarding Progress</h2>
      <div className="progress-card-body">
        <div
          aria-label={`${summary.percentComplete}% complete, ${summary.completedStageCount} of ${summary.totalStageCount} stages completed`}
          className="progress-ring"
          role="img"
          style={ringStyle}
        >
          <span className="progress-ring-value">{summary.percentComplete}%</span>
          <span className="progress-ring-label">Complete</span>
        </div>
        <div className="progress-summary">
          <span className="dashboard-kicker">Current Stage</span>
          <strong>
            {summary.currentStage?.title ?? getCompletedStageLabel(summary.percentComplete)}
          </strong>
          <p>
            {summary.currentStage?.description ??
              'The roadmap does not currently identify a stage in progress.'}
          </p>
          <a className="dashboard-text-link" href="#onboarding-roadmap" onClick={focusRoadmap}>
            View roadmap <ArrowIcon />
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
    return <DashboardSkeleton ariaLabel="Loading onboarding roadmap" className="roadmap-section" />;
  }

  return (
    <section className="roadmap-section" aria-labelledby="onboarding-roadmap">
      <h2 id="onboarding-roadmap" tabIndex={-1}>
        Onboarding Roadmap
      </h2>
      {roadmap.status === 'partial' ? (
        <p className="dashboard-inline-notice" role="status">
          Some roadmap stages are temporarily unavailable.
        </p>
      ) : null}
      {roadmap.stages.length > 0 ? (
        <ol className="roadmap-list">
          {roadmap.stages.map((stage) => (
            <RoadmapStageCard key={stage.id} onReferenceStep={onReferenceStep} stage={stage} />
          ))}
        </ol>
      ) : (
        <div className="dashboard-card dashboard-empty-state roadmap-empty-state">
          <strong>
            {roadmap.status === 'empty' ? 'No roadmap available' : 'Roadmap unavailable'}
          </strong>
          <p>
            {roadmap.status === 'empty'
              ? 'A published roadmap will show your onboarding stages here.'
              : 'The roadmap could not be loaded. Try again from the workspace status message.'}
          </p>
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

  return (
    <li
      aria-current={stage.status === 'in-progress' ? 'step' : undefined}
      className={`roadmap-stage roadmap-stage--${stage.status}`}
    >
      <span aria-hidden="true" className="roadmap-marker">
        {stage.position}
      </span>
      <article className="dashboard-card roadmap-stage-card">
        <div className="roadmap-stage-heading">
          <h3>{stage.title}</h3>
          <span className={`status-badge status-badge--${stage.status}`}>{statusLabel}</span>
        </div>
        <p>{stage.description}</p>
        <button
          className="roadmap-assistant-action"
          onClick={() => onReferenceStep(stage.id)}
          type="button"
        >
          Ask assistant about this stage
        </button>
      </article>
    </li>
  );
}

function UpcomingTasksCard({ isLoading }: { isLoading: boolean }) {
  return (
    <section
      className="dashboard-card upcoming-tasks-card"
      aria-labelledby="upcoming-tasks-heading"
    >
      <div className="dashboard-card-heading">
        <h2 id="upcoming-tasks-heading">Upcoming Tasks</h2>
        <Link href="/workspace/tasks">View all</Link>
      </div>
      {isLoading ? (
        <div aria-label="Loading upcoming tasks" className="dashboard-skeleton-lines" role="status">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <div className="dashboard-empty-state dashboard-empty-state--compact">
          <strong>Task tracking is not connected yet</strong>
          <p>No tasks or due dates will be inferred from roadmap content.</p>
        </div>
      )}
    </section>
  );
}

function DashboardSkeleton({ ariaLabel, className }: { ariaLabel: string; className: string }) {
  return (
    <section
      aria-label={ariaLabel}
      className={`dashboard-card dashboard-skeleton ${className}`}
      role="status"
    >
      <span className="dashboard-skeleton-title" />
      <span />
      <span />
      <span />
    </section>
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

function ArrowIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path d="M3 8h9M9 4.5 12.5 8 9 11.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}
