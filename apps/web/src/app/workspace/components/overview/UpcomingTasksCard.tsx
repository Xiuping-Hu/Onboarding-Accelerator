import type { OnboardingTaskMutationSource, OnboardingTaskStatus } from '@onboarding/shared';
import Link from 'next/link';
import React from 'react';
import type { WorkspaceUpcomingTasksState } from '@/features/workspace/workspaceDashboardModel';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { OnboardingTaskRow } from '../tasks/OnboardingTaskRow';
import { DashboardEmptyState, dashboardCardClass } from './DashboardState';

export function UpcomingTasksCard({
  isLoading,
  onTransitionTask,
  pendingTaskIds,
  tasks,
}: {
  isLoading: boolean;
  onTransitionTask: (
    taskId: string,
    status: OnboardingTaskStatus,
    expectedRevision: number,
    source: OnboardingTaskMutationSource,
  ) => Promise<void>;
  pendingTaskIds: string[];
  tasks: WorkspaceUpcomingTasksState;
}) {
  return (
    <section className={cn(dashboardCardClass, 'p-5')} aria-labelledby="upcoming-tasks-heading">
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
      {isLoading && tasks.status === 'unavailable' ? (
        <div aria-label="Loading upcoming tasks" className="mt-4 grid gap-2" role="status">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : tasks.status === 'ready' ? (
        <ul className="mt-4 grid list-none gap-2 p-0">
          {tasks.items.map((task) => (
            <OnboardingTaskRow
              compact
              key={task.id}
              onTransitionTask={onTransitionTask}
              pending={pendingTaskIds.includes(task.id)}
              source="overview_ui"
              task={task}
            />
          ))}
        </ul>
      ) : (
        <DashboardEmptyState
          compact
          description={
            tasks.status === 'empty'
              ? 'There are no incomplete tasks in the active onboarding plan.'
              : 'Upcoming tasks are temporarily unavailable.'
          }
          title={tasks.status === 'empty' ? 'No upcoming tasks' : 'Tasks unavailable'}
        />
      )}
    </section>
  );
}
