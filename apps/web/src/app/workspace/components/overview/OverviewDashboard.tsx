'use client';

import React, { useMemo } from 'react';
import { createWorkspaceDashboardModel } from '@/features/workspace/workspaceDashboardModel';
import { useWorkspaceRoute } from '../WorkspaceRouteContext';
import { ProgressCard } from './ProgressCard';
import { RoadmapSection } from './RoadmapSection';
import { UpcomingTasksCard } from './UpcomingTasksCard';

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
