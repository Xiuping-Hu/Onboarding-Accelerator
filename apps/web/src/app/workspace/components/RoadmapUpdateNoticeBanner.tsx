import type { RoadmapUpdateNotice } from '@onboarding/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function RoadmapUpdateNoticeBanner({
  error,
  notice,
  onDismiss,
  onView,
  pending,
}: {
  error: string | null;
  notice: RoadmapUpdateNotice;
  onDismiss: () => void;
  onView: () => void;
  pending: boolean;
}) {
  return (
    <Alert className="mb-5 grid gap-3 border-indigo-200 bg-indigo-50 text-slate-900" role="status">
      <AlertDescription className="leading-relaxed">
        Your roadmap now reflects the latest knowledge base. We kept{' '}
        {formatCount(notice.retainedItemCount, 'task state')} and added{' '}
        {formatCount(notice.addedItemCount, 'task')}.
      </AlertDescription>
      {error ? (
        <p className="m-0 text-sm font-semibold text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={onView} size="sm" type="button">
          View latest roadmap
        </Button>
        <Button disabled={pending} onClick={onDismiss} size="sm" type="button" variant="outline">
          Dismiss
        </Button>
      </div>
    </Alert>
  );
}

function formatCount(count: number, label: string) {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}
