import { MenuIcon } from 'lucide-react';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import type { WorkspacePageMeta } from '@/features/workspace/controller/workspaceController.types';

export function WorkspaceHeader({
  headingRef,
  meta,
  mobileNavigationOpen,
  onOpenMobileNavigation,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  meta: WorkspacePageMeta;
  mobileNavigationOpen: boolean;
  onOpenMobileNavigation: () => void;
}) {
  return (
    <header className="mb-7 flex shrink-0 items-center gap-6 max-md:grid max-md:grid-cols-[44px_minmax(0,1fr)] max-md:gap-2.5 max-md:mb-5">
      <Button
        aria-controls="workspace-mobile-navigation"
        aria-expanded={mobileNavigationOpen}
        aria-label={mobileNavigationOpen ? 'Close navigation' : 'Open navigation'}
        className="hidden size-11 border-workspace-border bg-white text-slate-700 max-md:inline-flex"
        onClick={onOpenMobileNavigation}
        size="icon"
        type="button"
        variant="outline"
      >
        <MenuIcon aria-hidden="true" className="size-6" />
      </Button>
      <div className="min-w-0">
        <h1
          className="m-0 text-[clamp(22px,2vw,28px)] leading-tight font-bold text-workspace-heading outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 max-md:text-xl"
          ref={headingRef}
          tabIndex={-1}
        >
          {meta.title}
          {meta.showWave ? (
            <span aria-hidden="true" className="ml-2 inline-block">
              {'\u{1F44B}'}
            </span>
          ) : null}
        </h1>
        <p className="mt-2 mb-0 text-[15px] text-workspace-muted max-md:mt-1 max-md:text-xs">
          {meta.subtitle}
        </p>
      </div>
    </header>
  );
}
