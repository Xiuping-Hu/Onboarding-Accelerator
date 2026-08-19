import type { RoadmapUpdateNotice } from '@onboarding/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RoadmapUpdateNoticeBanner } from './RoadmapUpdateNoticeBanner';

export function WorkspaceStatusAlert({
  apiError,
  isSigningOut,
  logoutError,
  noticeActionPending,
  noticeError,
  onDismissRoadmapNotice,
  onLogout,
  onRetry,
  onViewRoadmapNotice,
  roadmapNotice,
  syncStatus,
}: {
  apiError: string | null;
  isSigningOut: boolean;
  logoutError: string | null;
  noticeActionPending: boolean;
  noticeError: string | null;
  onDismissRoadmapNotice: (noticeId: string) => Promise<boolean>;
  onLogout: () => void;
  onRetry: () => void;
  onViewRoadmapNotice: () => Promise<void>;
  roadmapNotice: RoadmapUpdateNotice | null;
  syncStatus: 'current' | 'pending' | 'failed' | null;
}) {
  if (isSigningOut) {
    return (
      <Alert className="mb-5 flex items-center" role="status">
        <AlertDescription>Signing you out…</AlertDescription>
      </Alert>
    );
  }

  if (logoutError || apiError) {
    return (
      <Alert
        className="mb-5 flex items-center justify-between gap-4"
        role="alert"
        variant="destructive"
      >
        <AlertDescription>{logoutError ?? apiError}</AlertDescription>
        <Button
          className="shrink-0 border-red-300 bg-white text-red-900 hover:bg-red-100"
          onClick={logoutError ? onLogout : onRetry}
          size="sm"
          type="button"
          variant="outline"
        >
          Try again
        </Button>
      </Alert>
    );
  }

  if (!roadmapNotice && syncStatus !== 'pending' && syncStatus !== 'failed') return null;

  return (
    <div>
      {syncStatus === 'pending' || syncStatus === 'failed' ? (
        <Alert className="mb-5" role="status">
          <AlertDescription>
            {syncStatus === 'pending'
              ? 'A newer roadmap is syncing. You can continue using your current version.'
              : 'A newer roadmap could not be synced yet. You can continue using your current version.'}
          </AlertDescription>
        </Alert>
      ) : null}
      {roadmapNotice ? (
        <RoadmapUpdateNoticeBanner
          error={noticeError}
          notice={roadmapNotice}
          onDismiss={() => void onDismissRoadmapNotice(roadmapNotice.id)}
          onView={() => void onViewRoadmapNotice()}
          pending={noticeActionPending}
        />
      ) : null}
    </div>
  );
}
