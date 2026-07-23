import React from 'react';
import { MicrosoftSignInLink } from './MicrosoftSignInLink';

export function LoginScreen({ error }: { error: string | null }) {
  return (
    <main className="login-shell">
      <section className="login-panel" aria-label="Account login">
        <p className="eyebrow">Onboarding</p>
        <h1>Sign in to your workspace</h1>
        <p className="login-description">Use your Tax Consulting SA Microsoft work account.</p>
        {error ? (
          <div className="login-error" role="alert">
            {error}
          </div>
        ) : null}
        <MicrosoftSignInLink />
      </section>
    </main>
  );
}
