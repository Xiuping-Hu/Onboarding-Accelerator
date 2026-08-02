import React from 'react';
import { WorkspaceNavigation } from './WorkspaceNavigation';

export function WorkspaceNavigationRail({
  collapsed,
  onCollapsedChange,
  onSignOut,
  pathname,
  signOutDisabled,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSignOut: () => void;
  pathname: string;
  signOutDisabled: boolean;
}) {
  return (
    <div className="relative z-10 hidden min-w-0 md:block">
      <WorkspaceNavigation
        className="sticky top-0 h-dvh"
        collapsed={collapsed}
        navigationId="workspace-primary-navigation-content"
        onCollapsedChange={onCollapsedChange}
        onSignOut={onSignOut}
        pathname={pathname}
        signOutDisabled={signOutDisabled}
      />
    </div>
  );
}
