'use client';

import {
  HouseIcon,
  LibraryIcon,
  ListChecksIcon,
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from 'lucide-react';
import Link from 'next/link';
import React, { useId, type ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const destinations = [
  { href: '/workspace', label: 'Overview', icon: HouseIcon },
  { href: '/workspace/tasks', label: 'Tasks', icon: ListChecksIcon },
  { href: '/workspace/resources', label: 'Resources', icon: LibraryIcon },
] as const;

export interface WorkspaceNavigationProps {
  pathname: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onNavigate?: () => void;
  onSignOut: () => void;
  signOutDisabled?: boolean;
  navigationId?: string;
  className?: string;
  allowCollapse?: boolean;
}

export function WorkspaceNavigation({
  allowCollapse = true,
  className,
  collapsed,
  navigationId,
  onCollapsedChange,
  onNavigate,
  onSignOut,
  pathname,
  signOutDisabled = false,
}: WorkspaceNavigationProps) {
  const generatedId = useId().replaceAll(':', '');
  const controlledRegionId = navigationId ?? `workspace-navigation-${generatedId}`;
  const toggleLabel = collapsed ? 'Expand navigation' : 'Collapse navigation';

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        aria-label="Workspace navigation"
        className={cn(
          'h-full w-full overflow-x-hidden overflow-y-auto bg-[linear-gradient(165deg,#3d4164_0%,var(--workspace-sidebar)_58%,#30334f_100%)] text-workspace-sidebar-text',
          className,
        )}
      >
        <div
          className={cn(
            'flex min-h-full flex-col gap-5 px-3 pt-5.5 pb-3.5',
            collapsed && 'items-center px-2.5',
          )}
          id={controlledRegionId}
        >
          <div
            className={cn(
              'flex min-h-19 items-center justify-center gap-2',
              collapsed && 'min-h-16',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Onboarding Accelerator"
              className={cn('size-16 shrink-0 object-contain', collapsed && 'size-11.5')}
              height={56}
              src="/icon.png"
              width={56}
            />
            <span className="sr-only">Onboarding Accelerator</span>
          </div>

          <nav aria-label="Primary navigation" className="min-w-0">
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {destinations.map(({ href, icon: Icon, label }) => {
                const active = destinationMatchesPathname(pathname, href);
                const action = (
                  <Button
                    asChild
                    className={cn(
                      'h-11 w-full min-w-0 justify-start gap-2.5 border border-transparent bg-transparent px-2.5 text-white/90 shadow-none hover:bg-white/10 hover:text-white focus-visible:ring-white',
                      active &&
                        'border-white/5 bg-white/15 text-white shadow-[inset_3px_0_0_#f0b93f]',
                      collapsed && 'w-11 justify-center px-0',
                    )}
                    variant="ghost"
                  >
                    <Link
                      aria-current={active ? 'page' : undefined}
                      aria-label={label}
                      href={href}
                      onClick={onNavigate}
                    >
                      <Icon aria-hidden="true" className="size-5 shrink-0" />
                      <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
                    </Link>
                  </Button>
                );

                return (
                  <li className="min-w-0" key={href}>
                    <CollapsedActionTooltip collapsed={collapsed} label={label}>
                      {action}
                    </CollapsedActionTooltip>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div aria-hidden="true" className="flex-1" />

          <footer className="grid w-full gap-2">
            <CollapsedActionTooltip collapsed={collapsed} label="Sign out">
              <Button
                aria-label="Sign out"
                className={cn(
                  'h-11 w-full justify-start gap-2.5 bg-transparent px-2.5 text-white/90 hover:bg-white/10 hover:text-white focus-visible:ring-white',
                  collapsed && 'w-11 justify-center px-0',
                )}
                disabled={signOutDisabled}
                onClick={onSignOut}
                type="button"
                variant="ghost"
              >
                <LogOutIcon aria-hidden="true" className="size-5" />
                <span className={cn('truncate', collapsed && 'sr-only')}>Sign out</span>
              </Button>
            </CollapsedActionTooltip>

            {allowCollapse ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-controls={controlledRegionId}
                    aria-expanded={!collapsed}
                    aria-label={toggleLabel}
                    className={cn(
                      'size-11 justify-self-start bg-transparent text-white/85 hover:bg-white/10 hover:text-white focus-visible:ring-white',
                      collapsed && 'justify-self-center',
                    )}
                    onClick={() => onCollapsedChange(!collapsed)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {collapsed ? (
                      <PanelLeftOpenIcon aria-hidden="true" className="size-5" />
                    ) : (
                      <PanelLeftCloseIcon aria-hidden="true" className="size-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{toggleLabel}</TooltipContent>
              </Tooltip>
            ) : null}
          </footer>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function CollapsedActionTooltip({
  children,
  collapsed,
  label,
}: {
  children: ReactElement;
  collapsed: boolean;
  label: string;
}) {
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function destinationMatchesPathname(pathname: string, href: string): boolean {
  const pathWithoutQuery = pathname.split(/[?#]/u, 1)[0] ?? '/';
  const normalizedPathname = pathWithoutQuery.replace(/\/+$/u, '') || '/';
  return href === '/workspace'
    ? normalizedPathname === href
    : normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
}
