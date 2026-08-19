'use client';

import React, { useMemo } from 'react';
import { createWorkspaceDashboardModel } from '@/features/workspace/workspaceDashboardModel';
import { useWorkspaceRoute } from '../WorkspaceRouteContext';
import { ProgressCard } from './ProgressCard';
import { RoadmapSection } from './RoadmapSection';
import { UpcomingTasksCard } from './UpcomingTasksCard';

export function OverviewDashboard() {
  const { onboarding, onboardingIsLoading, onTransitionTask, pendingTaskIds } = useWorkspaceRoute();
  const dashboard = useMemo(() => createWorkspaceDashboardModel(onboarding), [onboarding]);

  return (
    <div className="grid min-w-0 gap-5 pb-2">
      <ProgressCard isLoading={onboardingIsLoading} progress={dashboard.progress} />
      <RoadmapSection isLoading={onboardingIsLoading} roadmap={dashboard.roadmap} />
      <UpcomingTasksCard
        isLoading={onboardingIsLoading}
        onTransitionTask={onTransitionTask}
        pendingTaskIds={pendingTaskIds}
        tasks={dashboard.upcomingTasks}
      />
    </div>
  );
}
