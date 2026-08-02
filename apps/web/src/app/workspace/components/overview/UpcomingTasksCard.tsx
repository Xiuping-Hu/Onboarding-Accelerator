import Link from 'next/link';
import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DashboardEmptyState, dashboardCardClass } from './DashboardState';

export function UpcomingTasksCard({ isLoading }: { isLoading: boolean }) {
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
      {isLoading ? (
        <div aria-label="Loading upcoming tasks" className="mt-4 grid gap-2" role="status">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ) : (
        <DashboardEmptyState
          compact
          description="No tasks or due dates will be inferred from roadmap content."
          title="Task tracking is not connected yet"
        />
      )}
    </section>
  );
}
