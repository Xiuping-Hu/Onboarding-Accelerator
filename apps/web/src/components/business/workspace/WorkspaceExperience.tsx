'use client';

import { useEffect, useRef, useState } from 'react';
import { LoginScreen } from '@/components/business/auth/LoginScreen';
import { ErrorBoundary } from '@/components/common/feedback/ErrorBoundary';
import { getCurrentAccount, logoutAccount, type AccountSession } from '@/features/workspace/api';
import { WorkspaceShell } from './WorkspaceShell';

function WorkspaceContent({
  initialAccount,
  initialLoginError,
}: {
  initialAccount?: AccountSession;
  initialLoginError?: string;
}) {
  const [account, setAccount] = useState<AccountSession | null>(initialAccount ?? null);
  const [isAuthLoading, setIsAuthLoading] = useState(() => Boolean(initialAccount));
  const [loginError, setLoginError] = useState<string | null>(initialLoginError ?? null);
  const accountToRestoreRef = useRef(initialAccount);

  useEffect(() => {
    if (!accountToRestoreRef.current) {
      return;
    }

    let ignore = false;
    setIsAuthLoading(true);
    void getCurrentAccount()
      .then((currentAccount) => {
        if (!ignore) {
          setAccount(currentAccount);
          setLoginError(null);
        }
      })
      .catch((error) => {
        if (!ignore) {
          void logoutAccount().catch(() => undefined);
          setAccount(null);
          setLoginError(formatError(error, 'Could not restore your account session.'));
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsAuthLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  function handleLogout() {
    setIsAuthLoading(true);
    void logoutAccount()
      .catch(() => undefined)
      .finally(() => {
        setAccount(null);
        setLoginError(null);
        setIsAuthLoading(false);
        window.location.assign('/login');
      });
  }

  if (!account) {
    return <LoginScreen error={loginError} />;
  }

  if (isAuthLoading) {
    return <main className="loading-state auth-loading">Restoring account session...</main>;
  }

  return <WorkspaceShell account={account} onLogout={handleLogout} />;
}

export function WorkspaceExperience({
  initialAccount,
  initialLoginError,
}: {
  initialAccount?: AccountSession;
  initialLoginError?: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <main className="fatal-error" role="alert">
          <h1>Something went wrong</h1>
          <p>The onboarding workspace could not recover. Refresh the page and try again.</p>
        </main>
      }
    >
      <WorkspaceContent initialAccount={initialAccount} initialLoginError={initialLoginError} />
    </ErrorBoundary>
  );
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback} ${error.message}` : fallback;
}
