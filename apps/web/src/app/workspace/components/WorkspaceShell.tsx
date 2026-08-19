'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import type { AccountSession } from '@/features/workspace/api';
import { useWorkspaceController } from '@/features/workspace/controller/useWorkspaceController';
import { WorkspaceAssistantPanel } from './assistant/WorkspaceAssistantPanel';
import { WorkspaceFrame } from './WorkspaceFrame';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceRouteProvider } from './WorkspaceRouteContext';
import { WorkspaceStatusAlert } from './WorkspaceStatusAlert';

export function WorkspaceShell({
  account,
  children,
  isSigningOut,
  logoutError,
  onLogout,
}: {
  account: AccountSession;
  children: ReactNode;
  isSigningOut: boolean;
  logoutError: string | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const controller = useWorkspaceController({ account, pathname });
  const [isAssistantExpanded, setIsAssistantExpanded] = useState(false);

  return (
    <WorkspaceRouteProvider
      value={{
        apiError: controller.route.apiError,
        graph: controller.route.graph,
        isGuideEmpty: controller.route.isGuideEmpty,
        isLoading: controller.route.isLoading,
        knowledgeMapEnabled: controller.route.knowledgeMapEnabled,
        onboarding: controller.route.onboarding,
        onboardingIsLoading: controller.route.onboardingIsLoading,
        pendingTaskIds: controller.route.pendingTaskIds,
        onRetry: controller.route.onRetry,
        onTransitionTask: controller.route.onTransitionTask,
        sources: controller.route.sources,
      }}
    >
      <WorkspaceFrame
        assistant={
          <WorkspaceAssistantPanel
            assistant={controller.assistant}
            isExpanded={isAssistantExpanded}
            isLoading={controller.route.isLoading}
            onExpandedChange={setIsAssistantExpanded}
            userLabel={controller.account.label}
          />
        }
        collapsed={controller.navigation.effectiveCollapsed}
        header={
          <WorkspaceHeader
            headingRef={controller.route.headingRef}
            meta={controller.route.meta}
            mobileNavigationOpen={controller.navigation.mobileOpen}
            onOpenMobileNavigation={() => controller.navigation.setMobileOpen(true)}
          />
        }
        isAssistantMinimized={controller.assistant.isMinimized}
        isAssistantExpanded={isAssistantExpanded}
        isLoading={controller.route.isLoading}
        isMobileViewport={controller.navigation.isMobileViewport}
        mobileNavigationOpen={controller.navigation.mobileOpen}
        onCollapsedChange={controller.navigation.setCollapsed}
        onMobileNavigationOpenChange={controller.navigation.setMobileOpen}
        onSignOut={onLogout}
        pathname={pathname}
        signOutDisabled={isSigningOut}
        status={
          <WorkspaceStatusAlert
            apiError={controller.route.apiError}
            isSigningOut={isSigningOut}
            logoutError={logoutError}
            noticeActionPending={controller.route.noticeActionPending}
            noticeError={controller.route.noticeError}
            onLogout={onLogout}
            onDismissRoadmapNotice={controller.route.onDismissRoadmapNotice}
            onRetry={controller.route.onRetry}
            onViewRoadmapNotice={controller.route.onViewRoadmapNotice}
            roadmapNotice={
              controller.route.onboarding?.status === 'ready'
                ? controller.route.onboarding.newestUnreadNotice
                : null
            }
            syncStatus={
              controller.route.onboarding?.status === 'ready'
                ? controller.route.onboarding.userState.syncStatus
                : null
            }
          />
        }
      >
        {children}
      </WorkspaceFrame>
    </WorkspaceRouteProvider>
  );
}
