'use client';

import { useMemo } from 'react';
import { deriveWorkspaceResources } from '@/features/workspace/workspaceDashboardModel';
import { useWorkspaceRoute } from '../WorkspaceRouteContext';

export function ResourcesDashboard() {
  const { graph, isLoading, sources } = useWorkspaceRoute();
  const resources = useMemo(
    () => deriveWorkspaceResources(graph ? { ...graph, sources } : null),
    [graph, sources],
  );

  if (isLoading && resources.status === 'unavailable') {
    return (
      <div aria-label="Loading onboarding resources" className="resource-grid" role="status">
        <ResourceSkeleton />
        <ResourceSkeleton />
        <ResourceSkeleton />
      </div>
    );
  }

  if (resources.status !== 'ready') {
    return (
      <section className="route-dashboard" aria-labelledby="resources-content-heading">
        <div className="dashboard-card route-state-card">
          <div aria-hidden="true" className="route-state-icon">
            <ResourceIcon />
          </div>
          <div>
            <h2 id="resources-content-heading">
              {resources.status === 'empty' ? 'No resources available' : 'Resources unavailable'}
            </h2>
            <p>
              {resources.status === 'empty'
                ? 'Authorized resources attached to your onboarding roadmap will appear here.'
                : 'Resource links could not be safely resolved. No internal source locations have been exposed.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <ul className="resource-grid" aria-label="Onboarding resources">
      {resources.items.map((resource) => {
        const isExternal = /^https?:\/\//i.test(resource.href);
        return (
          <li className="dashboard-card resource-card" key={resource.id}>
            <span className="resource-type">{resource.label}</span>
            <h2>{resource.title}</h2>
            {resource.excerpt ? <p>{resource.excerpt}</p> : null}
            <a
              href={resource.href}
              rel={isExternal ? 'noopener noreferrer' : undefined}
              target={isExternal ? '_blank' : undefined}
            >
              Open resource
              {isExternal ? <span className="sr-only"> (opens in a new tab)</span> : null}
              <ExternalLinkIcon />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function ResourceSkeleton() {
  return (
    <div className="dashboard-card dashboard-skeleton resource-card">
      <span className="dashboard-skeleton-title" />
      <span />
      <span />
    </div>
  );
}

function ResourceIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24">
      <path
        d="M6.5 4.5h8l3 3v12h-11zM14.5 4.5v3h3M9.5 12h5M9.5 15.5h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="M6.5 3.5H3.75a1.25 1.25 0 0 0-1.25 1.25v7.5a1.25 1.25 0 0 0 1.25 1.25h7.5a1.25 1.25 0 0 0 1.25-1.25V9.5M9 2.5h4.5V7M13.25 2.75 7.5 8.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
