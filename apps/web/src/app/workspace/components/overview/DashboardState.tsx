import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const dashboardCardClass =
  'min-w-0 rounded-xl border border-workspace-border bg-workspace-card shadow-[0_5px_18px_rgb(31_38_61_/_5%)]';

export function DashboardSkeleton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(dashboardCardClass, 'grid gap-3 p-5')}
      role="status"
    >
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </section>
  );
}

export function DashboardEmptyState({
  compact = false,
  description,
  title,
}: {
  compact?: boolean;
  description: string;
  title: string;
}) {
  return (
    <div className={cn('px-5 py-8 text-center', compact && 'px-0 py-5 text-left')}>
      <strong className="text-sm text-workspace-heading">{title}</strong>
      <p className="mt-1 mb-0 text-sm leading-relaxed text-workspace-muted">{description}</p>
    </div>
  );
}
