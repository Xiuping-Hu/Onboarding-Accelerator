import React from 'react';

export function MicrosoftSignInLink({ returnTo }: { returnTo?: string }) {
  const href = returnTo
    ? `/api/auth/microsoft/start?returnTo=${encodeURIComponent(returnTo)}`
    : '/api/auth/microsoft/start';

  return (
    <a className="primary-button microsoft-login-button" href={href}>
      <span aria-hidden="true" className="microsoft-mark">
        <span />
        <span />
        <span />
        <span />
      </span>
      Continue with Microsoft
    </a>
  );
}
