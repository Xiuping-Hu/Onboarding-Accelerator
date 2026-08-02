import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function WorkspaceStatusAlert({
  apiError,
  isSigningOut,
  logoutError,
  onLogout,
  onRetry,
}: {
  apiError: string | null;
  isSigningOut: boolean;
  logoutError: string | null;
  onLogout: () => void;
  onRetry: () => void;
}) {
  if (isSigningOut) {
    return (
      <Alert className="mb-5 flex items-center" role="status">
        <AlertDescription>Signing you out…</AlertDescription>
      </Alert>
    );
  }

  if (!logoutError && !apiError) return null;

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
