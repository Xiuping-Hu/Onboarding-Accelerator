import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function MicrosoftSignInLink({
  compactAfterError = false,
  returnTo,
  variant = 'default',
}: {
  compactAfterError?: boolean;
  returnTo?: string;
  variant?: 'default' | 'login';
}) {
  const href = returnTo
    ? `/api/auth/microsoft/start?returnTo=${encodeURIComponent(returnTo)}`
    : '/api/auth/microsoft/start';

  return (
    <Button
      asChild
      className={cn(
        'min-h-10 gap-2 no-underline hover:no-underline',
        variant === 'login' &&
          'mt-6 h-[68px] w-full flex-none gap-[clamp(16px,6vw,28px)] rounded-xl border-[1.5px] border-[#c5c0ff] bg-white/95 px-4.5 text-[clamp(19px,6vw,24px)] font-semibold text-[#0b1027] shadow-[0_4px_10px_rgb(73_65_220_/_15%)] hover:border-[#aaa3ff] hover:bg-white hover:text-[#0b1027] hover:shadow-[0_6px_14px_rgb(73_65_220_/_18%)] active:border-[#8f87f3] active:bg-[#faf9ff] focus-visible:ring-[3px] focus-visible:ring-[#4b45e6] focus-visible:ring-offset-4 max-[390px]:gap-3.5 max-[390px]:text-lg [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:mt-[26px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:h-[82px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:gap-8 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:px-7 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:text-[24px]',
        compactAfterError &&
          '[@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:mt-4.5',
      )}
    >
      <a data-auth-variant={variant} href={href}>
        <MicrosoftMark large={variant === 'login'} />
        <span className={cn(variant === 'login' && 'relative -top-px -left-[3px]')}>
          Continue with Microsoft
        </span>
      </a>
    </Button>
  );
}

function MicrosoftMark({ large }: { large: boolean }) {
  const squareClass = cn(
    'size-2 bg-white',
    large &&
      'size-4 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:size-5',
  );

  return (
    <span
      className={cn('grid flex-none grid-cols-2 gap-0.5', large && 'relative left-px')}
      aria-hidden="true"
      data-slot="microsoft-mark"
    >
      <span className={cn(squareClass, large && 'bg-[#f25022]')} />
      <span className={cn(squareClass, large && 'bg-[#7fba00]')} />
      <span className={cn(squareClass, large && 'bg-[#00a4ef]')} />
      <span className={cn(squareClass, large && 'bg-[#ffb900]')} />
    </span>
  );
}
