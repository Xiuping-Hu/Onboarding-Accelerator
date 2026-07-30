import React from 'react';
import { MicrosoftSignInLink } from './MicrosoftSignInLink';

export function LoginScreen({ error }: { error: string | null }) {
  const panelClassName = error ? 'login-panel login-panel--with-error' : 'login-panel';

  return (
    <main className="login-shell" aria-labelledby="login-title">
      <LoginBackground />

      <div className="login-stage">
        <div className="login-layout">
          <div className="login-brand" role="img" aria-label="Onboarding Accelerator">
            <span className="login-brand-mark" aria-hidden="true">
              {/* Kept as a direct asset so server-rendered component tests and the browser use the same markup. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="login-brand-image"
                src="/favicon.ico?v=3"
                alt=""
                width={144}
                height={128}
              />
            </span>
            <span className="login-brand-copy" aria-hidden="true">
              <span>Onboarding</span>
              <span>Accelerator</span>
            </span>
          </div>

          <section className={panelClassName} aria-labelledby="login-title">
            <span className="login-icon-medallion login-icon-medallion--people" aria-hidden="true">
              <PeopleIcon />
            </span>

            <h1 id="login-title">Welcome back.</h1>

            <p className="login-description">
              <span className="login-description-line">
                Sign in with your company Microsoft account
              </span>
              <span className="login-description-line">to access Onboarding Accelerator.</span>
            </p>

            {error ? (
              <div className="login-error" role="alert">
                {error}
              </div>
            ) : null}

            <MicrosoftSignInLink variant="login" />

            <div className="login-trust-divider">
              <span aria-hidden="true" />
              <p>Secure and trusted</p>
              <span aria-hidden="true" />
            </div>

            <div className="login-security">
              <span
                className="login-icon-medallion login-icon-medallion--security"
                aria-hidden="true"
              >
                <SecurityIcon />
              </span>
              <div className="login-security-copy">
                <h2>Secure sign-in with Microsoft</h2>
                <p>Your organization’s data is protected.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function LoginBackground() {
  return (
    <div className="login-background" aria-hidden="true">
      <div className="login-background-art">
        <span className="login-background-ellipse login-background-ellipse--deep" />
        <span className="login-background-ellipse login-background-ellipse--outer-gap" />
        <span className="login-background-ellipse login-background-ellipse--middle" />
        <span className="login-background-ellipse login-background-ellipse--inner-gap" />
        <span className="login-background-ellipse login-background-ellipse--light" />
        <span className="login-background-ellipse login-background-ellipse--surface" />
      </div>
    </div>
  );
}

function PeopleIcon() {
  return (
    <svg
      className="login-people-icon"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 68 60"
      fill="none"
    >
      <circle cx="34" cy="14" r="9" />
      <circle cx="12" cy="19" r="6" />
      <circle cx="56" cy="19" r="6" />
      <path d="M18 44v-8.5C18 29.15 23.15 24 29.5 24h9C44.85 24 50 29.15 50 35.5V44c0 5-3 8-8 8H26c-5 0-8-3-8-8Z" />
      <path d="M14 30h-3C5.48 30 2 33.48 2 39v6c0 3.31 2.69 6 6 6h6" />
      <path d="M54 30h3c5.52 0 9 3.48 9 9v6c0 3.31-2.69 6-6 6h-6" />
    </svg>
  );
}

function SecurityIcon() {
  return (
    <svg
      className="login-security-icon"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 32 32"
      fill="none"
    >
      <path d="M16 3.5 25 7v7.35c0 6.12-3.45 10.69-9 14.15-5.55-3.46-9-8.03-9-14.15V7l9-3.5Z" />
      <rect x="11.5" y="14" width="9" height="8" rx="1.5" />
      <path d="M13.5 14v-2a2.5 2.5 0 0 1 5 0v2" />
      <circle cx="16" cy="18" r="0.9" className="login-security-icon-keyhole" />
    </svg>
  );
}
