'use client';

import { useWorkspaceRoute } from '../WorkspaceRouteContext';

export function TasksDashboard() {
  const { isLoading } = useWorkspaceRoute();

  return (
    <section className="route-dashboard" aria-labelledby="tasks-content-heading">
      <div className="dashboard-card route-state-card">
        <div aria-hidden="true" className="route-state-icon">
          <TaskListIcon />
        </div>
        <div>
          <h2 id="tasks-content-heading">
            {isLoading ? 'Loading task availability' : 'Task tracking is not connected yet'}
          </h2>
          <p>
            {isLoading
              ? 'Checking the current onboarding journey for supported task data.'
              : 'The current workspace contract does not provide task IDs, due dates, or a completion mutation. Roadmap stages will not be presented as tasks.'}
          </p>
          {!isLoading ? (
            <p className="route-state-note" role="status">
              This page will populate when an authorized task contract is available.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TaskListIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24">
      <path
        d="m5 7 1.6 1.6L9.5 5.7M5 13l1.6 1.6 2.9-2.9M12 7h7M12 13h7M5 19h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}
