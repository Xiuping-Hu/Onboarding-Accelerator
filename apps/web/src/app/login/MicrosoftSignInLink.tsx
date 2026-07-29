import React from 'react';

export function MicrosoftSignInLink({
  returnTo,
  variant = 'default',
}: {
  returnTo?: string;
  variant?: 'default' | 'login';
}) {
  const href = returnTo
    ? `/api/auth/microsoft/start?returnTo=${encodeURIComponent(returnTo)}`
    : '/api/auth/microsoft/start';
  const className =
    variant === 'login'
      ? 'microsoft-login-button microsoft-login-button--hero'
      : 'primary-button microsoft-login-button';

  return (
    <a className={className} href={href}>
      <span aria-hidden="true" className="microsoft-mark">
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="microsoft-login-label">Continue with Microsoft</span>
    </a>
  );
}
