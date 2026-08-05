'use client';

import { ListChecksIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceRoute } from '../../components/WorkspaceRouteContext';
import { OnboardingTaskRow } from '../../components/tasks/OnboardingTaskRow';

export function TasksDashboard() {
  const { onboarding, onboardingIsLoading, onTransitionTask, pendingTaskIds } = useWorkspaceRoute();

  if (onboardingIsLoading && !onboarding) {
    return (
      <section aria-label="Loading onboarding tasks" className="grid gap-3" role="status">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </section>
    );
  }

  if (!onboarding || onboarding.status === 'empty') {
    return (
      <section aria-labelledby="tasks-content-heading" className="pb-2">
        <div className="grid min-h-52 grid-cols-[64px_minmax(0,1fr)] items-center gap-5 rounded-xl border border-workspace-border bg-white p-7 shadow-[0_5px_18px_rgb(31_38_61_/_5%)] max-md:min-h-0 max-md:grid-cols-1 max-md:p-5">
          <div
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-xl bg-workspace-assistant-soft text-workspace-assistant"
          >
            <ListChecksIcon className="size-7" />
          </div>
          <div>
            <h2 className="m-0 text-lg font-bold text-workspace-heading" id="tasks-content-heading">
              No active onboarding plan
            </h2>
            <p className="mt-2 mb-0 max-w-2xl text-sm leading-relaxed text-workspace-muted">
              Tasks will appear after an approved onboarding plan is activated for this
              conversation.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="tasks-content-heading" className="pb-2">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-lg font-bold text-workspace-heading" id="tasks-content-heading">
            All onboarding tasks
          </h2>
          <p className="mt-1 mb-0 text-sm text-workspace-muted">
            {onboarding.projection.progress.completedTaskCount} of{' '}
            {onboarding.projection.progress.totalTaskCount} progress-bearing tasks completed
          </p>
        </div>
      </div>
      <ul className="grid list-none gap-3 p-0">
        {onboarding.projection.tasks.map((task) => (
          <OnboardingTaskRow
            key={task.id}
            onTransitionTask={onTransitionTask}
            pending={pendingTaskIds.includes(task.id)}
            source="tasks_ui"
            task={task}
          />
        ))}
      </ul>
    </section>
  );
}
