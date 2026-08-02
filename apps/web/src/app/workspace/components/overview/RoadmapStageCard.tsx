import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WorkspaceRoadmapStage } from '@/features/workspace/workspaceDashboardModel';
import { cn } from '@/lib/utils';
import { dashboardCardClass } from './DashboardState';

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

export function RoadmapStageCard({
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
      <article className={cn(dashboardCardClass, 'p-4', styles.card)}>
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
