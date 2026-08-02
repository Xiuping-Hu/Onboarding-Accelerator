'use client';

import { ListChecksIcon } from 'lucide-react';
import { useWorkspaceRoute } from '../../components/WorkspaceRouteContext';

export function TasksDashboard() {
  const { isLoading } = useWorkspaceRoute();

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
            {isLoading ? 'Loading task availability' : 'Task tracking is not connected yet'}
          </h2>
          <p className="mt-2 mb-0 max-w-2xl text-sm leading-relaxed text-workspace-muted">
            {isLoading
              ? 'Checking the current onboarding journey for supported task data.'
              : 'The current workspace contract does not provide task IDs, due dates, or a completion mutation. Roadmap stages will not be presented as tasks.'}
          </p>
          {!isLoading ? (
            <p
              className="mt-4 mb-0 rounded-lg border border-workspace-border bg-workspace-viewport p-3 text-sm text-workspace-muted"
              role="status"
            >
              This page will populate when an authorized task contract is available.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
