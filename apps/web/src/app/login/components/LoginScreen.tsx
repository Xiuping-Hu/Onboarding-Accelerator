import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { LoginBackground } from './LoginBackground';
import { LoginBrand } from './LoginBrand';
import { LoginSecurityNotice } from './LoginSecurityNotice';
import { MicrosoftSignInLink } from './MicrosoftSignInLink';

const desktopScene =
  '[@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:justify-center [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:overflow-hidden [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:p-0';

export function LoginScreen({ error }: { error: string | null }) {
  return (
    <main
      className={cn(
        'relative isolate flex min-h-dvh flex-col items-center overflow-x-hidden bg-[#faf8fb] px-4 pt-[clamp(24px,6svh,48px)] pb-[clamp(32px,8svh,64px)] text-[#0b1027]',
        desktopScene,
      )}
      aria-labelledby="login-title"
      data-slot="login-shell"
    >
      <LoginBackground />

      <div
        className="relative z-1 flex w-full flex-none flex-col items-center [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:block [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:aspect-[3/2] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:w-[min(100vw,150dvh)] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:[container-type:inline-size]"
        data-slot="login-stage"
      >
        <div
          className="flex w-full flex-none flex-col items-center [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:absolute [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:top-0 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:left-0 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:h-[1024px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:w-[1536px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:px-4 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:pt-[72px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:pb-[132px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:[transform:scale(calc(100cqw/1536px))] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:[transform-origin:top_left]"
          data-slot="login-layout"
        >
          <LoginBrand />

          <section
            className={cn(
              'relative z-1 flex h-auto min-h-0 w-[min(620px,calc(100vw-32px))] flex-none flex-col items-center rounded-[25px] border border-[#e8e7efc7] bg-white/94 px-[clamp(20px,8vw,48px)] pt-8 pb-9 text-center shadow-[0_10px_32px_rgb(20_25_55_/_8%)] backdrop-blur-[3px] max-[390px]:px-5 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:h-[600px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:px-[54px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:pt-[42px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:pb-[45px]',
              error &&
                '[@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:h-auto [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:min-h-[665px]',
            )}
            aria-labelledby="login-title"
            data-slot="login-panel"
          >
            <span
              className="grid size-24 flex-none place-items-center rounded-full bg-[radial-gradient(circle_at_36%_30%,#f7f6ff_0%,#efedff_51%,#e4e0ff_100%)] text-[#4b45e6] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:size-[104px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:-translate-x-0.5"
              aria-hidden="true"
            >
              <PeopleIcon />
            </span>

            <h1
              className="relative mt-4.5 text-[clamp(36px,11vw,50px)] leading-[1.15] font-bold tracking-[-1px] text-[#0b1027] max-[390px]:text-[38px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:left-0.5 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:mt-4 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:text-[50px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:leading-[60px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:tracking-[0.43px]"
              id="login-title"
            >
              Welcome back.
            </h1>

            <p className="relative mt-2 text-lg leading-[27px] text-[#4b5677] max-[390px]:text-[17px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:-left-px [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:mt-3 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:text-[21.5px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:leading-[31px]">
              <span className="inline [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:block">
                Sign in with your company Microsoft account{' '}
              </span>
              <span className="inline [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:block">
                to access Onboarding Accelerator.
              </span>
            </p>

            {error ? (
              <Alert className="mt-4 text-left text-base" role="alert" variant="destructive">
                <AlertDescription className="font-semibold">{error}</AlertDescription>
              </Alert>
            ) : null}

            <MicrosoftSignInLink compactAfterError={Boolean(error)} variant="login" />

            <div className="mt-7 grid h-6 w-full flex-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[13px] text-[#4b5677] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:mt-[30px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:gap-5">
              <span className="h-px bg-[#d7dae4]" aria-hidden="true" />
              <p className="m-0 text-base leading-6 tracking-[0.55px] whitespace-nowrap [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:text-[19px]">
                Secure and trusted
              </p>
              <span className="h-px bg-[#d7dae4]" aria-hidden="true" />
            </div>

            <LoginSecurityNotice />
          </section>
        </div>
      </div>
    </main>
  );
}

function PeopleIcon() {
  return (
    <svg
      className="h-[52px] w-[58px] overflow-visible stroke-current stroke-[2.8] [stroke-linecap:round] [stroke-linejoin:round] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:h-[60px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:w-[68px]"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 68 60"
      fill="none"
      data-slot="login-people-icon"
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
