import type { ReactNode, RefObject } from 'react';
import { cn } from '@/lib/utils';
import { WorkspaceMobileNavigation } from './navigation/WorkspaceMobileNavigation';
import { WorkspaceNavigationRail } from './navigation/WorkspaceNavigationRail';

export function WorkspaceFrame({
  assistant,
  assistantWidth,
  children,
  collapsed,
  dashboardGridRef,
  header,
  isAssistantMinimized,
  isAssistantExpanded,
  isAssistantResizing,
  isLoading,
  isMobileViewport,
  mobileNavigationOpen,
  onCollapsedChange,
  onMobileNavigationOpenChange,
  onSignOut,
  pathname,
  signOutDisabled,
  status,
}: {
  assistant: ReactNode;
  assistantWidth: number;
  children: ReactNode;
  collapsed: boolean;
  dashboardGridRef: RefObject<HTMLDivElement | null>;
  header: ReactNode;
  isAssistantMinimized: boolean;
  isAssistantExpanded: boolean;
  isAssistantResizing: boolean;
  isLoading: boolean;
  isMobileViewport: boolean;
  mobileNavigationOpen: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onMobileNavigationOpenChange: (open: boolean) => void;
  onSignOut: () => void;
  pathname: string;
  signOutDisabled: boolean;
  status: ReactNode;
}) {
  const mobileModalOpen = isMobileViewport && mobileNavigationOpen;

  return (
    <div
      className={cn(
        'relative h-dvh min-h-0 overflow-hidden bg-workspace-viewport md:grid md:transition-[grid-template-columns] md:duration-200 motion-reduce:transition-none',
        collapsed ? 'md:grid-cols-[64px_minmax(0,1fr)]' : 'md:grid-cols-[160px_minmax(0,1fr)]',
      )}
      data-assistant-minimized={isAssistantMinimized ? 'true' : 'false'}
      data-assistant-expanded={isAssistantExpanded ? 'true' : 'false'}
      data-assistant-resizing={isAssistantResizing ? 'true' : 'false'}
      data-assistant-width={Math.round(assistantWidth)}
      data-navigation-collapsed={collapsed ? 'true' : 'false'}
    >
      <WorkspaceNavigationRail
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        onSignOut={onSignOut}
        pathname={pathname}
        signOutDisabled={signOutDisabled}
      />

      <WorkspaceMobileNavigation
        onOpenChange={onMobileNavigationOpenChange}
        onSignOut={onSignOut}
        open={mobileModalOpen}
        pathname={pathname}
        signOutDisabled={signOutDisabled}
      />

      <div
        aria-hidden={mobileModalOpen || undefined}
        className="relative z-0 h-dvh min-h-0 min-w-0 overflow-hidden bg-[radial-gradient(circle_at_85%_4%,rgb(238_240_255_/_65%),transparent_24%)] bg-workspace-surface"
        data-slot="workspace-dashboard-surface"
      >
        <div
          className={cn(
            'grid h-full min-h-0 min-w-0 items-stretch gap-6 overflow-hidden max-lg:grid-cols-1 max-lg:items-start max-lg:overflow-y-auto max-lg:gap-4 motion-reduce:transition-none',
            isAssistantResizing
              ? 'lg:cursor-col-resize lg:select-none lg:transition-none'
              : 'lg:transition-[grid-template-columns] lg:duration-300 lg:ease-out',
            isAssistantMinimized
              ? 'lg:grid-cols-[minmax(420px,1fr)_64px]'
              : 'lg:grid-cols-[minmax(420px,1fr)_minmax(300px,var(--workspace-assistant-width,360px))]',
          )}
          data-slot="workspace-dashboard-grid"
          ref={dashboardGridRef}
        >
          <div
            className="flex min-h-0 min-w-0 flex-col overflow-hidden pt-8.5 pr-0 pb-9.5 pl-8.5 max-[1180px]:pt-7 max-[1180px]:pr-0 max-[1180px]:pb-8 max-[1180px]:pl-6 max-lg:min-h-auto max-lg:overflow-visible max-lg:pt-7 max-lg:pr-6 max-lg:pb-0 max-md:pt-5 max-md:pr-4 max-md:pl-4"
            data-slot="workspace-main-column"
          >
            {header}
            {status}
            <main
              aria-busy={isLoading}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-lg:overflow-visible"
              id="workspace-content"
            >
              {children}
            </main>
          </div>
          {assistant}
        </div>
      </div>
    </div>
  );
}
