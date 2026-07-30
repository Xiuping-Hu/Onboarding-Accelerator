'use client';

import Link from 'next/link';
import React, { useId, type ReactElement, type ReactNode, type SVGProps } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/common/overlays/Tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const destinations = [
  { href: '/workspace', label: 'Overview', icon: OverviewIcon },
  { href: '/workspace/tasks', label: 'Tasks', icon: TasksIcon },
  { href: '/workspace/resources', label: 'Resources', icon: ResourcesIcon },
] as const;

export type WorkspaceNavigationProps = {
  /** The current route, supplied by the owning workspace shell. */
  pathname: string;
  /** The rail presentation is controlled by the owning workspace shell. */
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onNavigate?: () => void;
  onSignOut: () => void;
  inactive?: boolean;
  onDismiss?: () => void;
  signOutDisabled?: boolean;
  navigationId?: string;
  className?: string;
};

export function WorkspaceNavigation({
  className,
  collapsed,
  inactive = false,
  navigationId,
  onCollapsedChange,
  onDismiss,
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
        aria-hidden={inactive || undefined}
        aria-label="Workspace navigation"
        aria-modal={onDismiss ? true : undefined}
        className={cn(
          'workspace-navigation',
          collapsed && 'workspace-navigation--collapsed',
          className,
        )}
        data-collapsed={collapsed ? 'true' : 'false'}
        inert={inactive || undefined}
        role={onDismiss ? 'dialog' : undefined}
      >
        <div className="workspace-navigation__content" id={controlledRegionId}>
          <div className="workspace-navigation__brand">
            {/* The App Router serves app/icon.png at this stable metadata path. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Onboarding Accelerator"
              className="workspace-navigation__brand-mark"
              height={56}
              src="/icon.png"
              width={56}
            />
            <span
              aria-hidden="true"
              className="workspace-navigation__brand-name"
              hidden={collapsed}
            >
              Onboarding Accelerator
            </span>
            {onDismiss ? (
              <Button
                aria-label="Close navigation"
                className="workspace-navigation__dismiss"
                onClick={onDismiss}
                size="icon"
                type="button"
                variant="ghost"
              >
                <CloseIcon className="workspace-navigation__dismiss-icon" />
              </Button>
            ) : null}
          </div>

          <nav aria-label="Primary navigation" className="workspace-navigation__menu">
            <ul className="workspace-navigation__menu-list">
              {destinations.map(({ href, icon: Icon, label }) => {
                const active = destinationMatchesPathname(pathname, href);
                const action = (
                  <Button
                    asChild
                    className={cn(
                      'workspace-navigation__action',
                      active && 'workspace-navigation__action--active',
                    )}
                    variant="ghost"
                  >
                    <Link
                      aria-current={active ? 'page' : undefined}
                      aria-label={label}
                      href={href}
                      onClick={onNavigate}
                    >
                      <Icon className="workspace-navigation__action-icon" />
                      <ActionLabel collapsed={collapsed}>{label}</ActionLabel>
                    </Link>
                  </Button>
                );

                return (
                  <li className="workspace-navigation__menu-item" key={href}>
                    <CollapsedActionTooltip collapsed={collapsed} label={label}>
                      {action}
                    </CollapsedActionTooltip>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div aria-hidden="true" className="workspace-navigation__spacer" />

          <footer className="workspace-navigation__footer">
            <CollapsedActionTooltip collapsed={collapsed} label="Sign out">
              <Button
                aria-label="Sign out"
                className="workspace-navigation__action workspace-navigation__sign-out"
                disabled={signOutDisabled}
                onClick={onSignOut}
                type="button"
                variant="ghost"
              >
                <SignOutIcon className="workspace-navigation__action-icon" />
                <ActionLabel collapsed={collapsed}>Sign out</ActionLabel>
              </Button>
            </CollapsedActionTooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-controls={controlledRegionId}
                  aria-expanded={!collapsed}
                  aria-label={toggleLabel}
                  className="workspace-navigation__collapse"
                  onClick={() => onCollapsedChange(!collapsed)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <NavigationToggleIcon
                    className="workspace-navigation__collapse-icon"
                    direction={collapsed ? 'open' : 'close'}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{toggleLabel}</TooltipContent>
            </Tooltip>
          </footer>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function ActionLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span className="workspace-navigation__action-label" hidden={collapsed}>
      {children}
    </span>
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
  if (!collapsed) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function destinationMatchesPathname(pathname: string, href: string): boolean {
  const pathWithoutQuery = pathname.split(/[?#]/u, 1)[0] ?? '/';
  const normalizedPathname = pathWithoutQuery.replace(/\/+$/u, '') || '/';

  if (href === '/workspace') {
    return normalizedPathname === href;
  }

  return normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
}

type IconProps = SVGProps<SVGSVGElement>;

function IconFrame({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      {...props}
    >
      {children}
    </svg>
  );
}

function OverviewIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M3.75 10.5 12 3.75l8.25 6.75M5.75 9.25v10h12.5v-10M9.25 19.25v-5.5h5.5v5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </IconFrame>
  );
}

function TasksIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect
        height="16.5"
        rx="1.75"
        stroke="currentColor"
        strokeWidth="1.75"
        width="15.5"
        x="4.25"
        y="3.75"
      />
      <path
        d="m7.5 9 1.25 1.25L11 7.75M13.5 9h3M7.5 15l1.25 1.25L11 13.75M13.5 15h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </IconFrame>
  );
}

function ResourcesIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M5.25 4.25h5A2.75 2.75 0 0 1 13 7v12.75H7.25a2 2 0 0 1-2-2V4.25Zm13.5 0h-3A2.75 2.75 0 0 0 13 7v12.75h3.75a2 2 0 0 0 2-2V4.25Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </IconFrame>
  );
}

function SignOutIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M10.5 5.25H6.75a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h3.75M14.25 8.25 18 12l-3.75 3.75M8.5 12H18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </IconFrame>
  );
}

function CloseIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.75"
      />
    </IconFrame>
  );
}

function NavigationToggleIcon({
  direction,
  ...props
}: IconProps & { direction: 'close' | 'open' }) {
  const chevronPath = direction === 'close' ? 'm14 8-4 4 4 4' : 'm10 8 4 4-4 4';

  return (
    <IconFrame {...props}>
      <rect
        height="16.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
        width="18.5"
        x="2.75"
        y="3.75"
      />
      <path d="M7 4v16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path
        d={chevronPath}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </IconFrame>
  );
}
