'use client';

import React from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { WorkspaceNavigation } from './WorkspaceNavigation';

export function WorkspaceMobileNavigation({
  onOpenChange,
  onSignOut,
  open,
  pathname,
  signOutDisabled,
}: {
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
  open: boolean;
  pathname: string;
  signOutDisabled: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-label="Workspace navigation"
        className="rounded-r-[18px] border-0 bg-workspace-sidebar p-0 text-workspace-sidebar-text"
        id="workspace-mobile-navigation"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => {
            document.querySelector<HTMLElement>('[aria-label="Open navigation"]')?.focus();
          });
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>('#workspace-mobile-navigation-content a[href]')
              ?.focus();
          });
        }}
        side="left"
      >
        <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
        <WorkspaceNavigation
          allowCollapse={false}
          collapsed={false}
          navigationId="workspace-mobile-navigation-content"
          onCollapsedChange={() => undefined}
          onNavigate={() => onOpenChange(false)}
          onSignOut={onSignOut}
          pathname={pathname}
          signOutDisabled={signOutDisabled}
        />
      </SheetContent>
    </Sheet>
  );
}
