'use client';

import { useState, type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/common/feedback/ErrorBoundary';
import { logoutAccount, type AccountSession } from '@/features/workspace/api';
import { WorkspaceShell } from './WorkspaceShell';

export function WorkspaceExperience({
  children,
  initialAccount,
}: {
  children: ReactNode;
  initialAccount: AccountSession;
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  function handleLogout() {
    if (isLoggingOut) return;
    setLogoutError(null);
    setIsLoggingOut(true);
    void logoutAccount()
      .then(() => {
        window.location.assign('/login');
      })
      .catch(() => {
        setIsLoggingOut(false);
        setLogoutError('Could not sign out. Please try again.');
      });
  }

  return (
    <ErrorBoundary
      fallback={
        <main className="grid min-h-dvh place-items-center p-6 text-center" role="alert">
          <div>
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-muted-foreground">
              The onboarding workspace could not recover. Refresh the page and try again.
            </p>
          </div>
        </main>
      }
    >
      <WorkspaceShell
        account={initialAccount}
        isSigningOut={isLoggingOut}
        logoutError={logoutError}
        onLogout={handleLogout}
      >
        {children}
      </WorkspaceShell>
    </ErrorBoundary>
  );
}
