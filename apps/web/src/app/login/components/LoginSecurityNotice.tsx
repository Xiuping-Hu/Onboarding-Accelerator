import React from 'react';

export function LoginSecurityNotice() {
  return (
    <div className="mt-[27px] flex w-full items-center justify-center gap-[15px] text-left max-[390px]:items-start max-[390px]:gap-3 [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:mt-[34px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:justify-start [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:gap-[19px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:pl-[66px]">
      <span
        className="grid size-12 flex-none place-items-center rounded-full bg-[radial-gradient(circle_at_36%_30%,#f7f6ff_0%,#efedff_51%,#e4e0ff_100%)] text-[#4b45e6] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:size-[54px]"
        aria-hidden="true"
      >
        <SecurityIcon />
      </span>
      <div className="max-[390px]:flex-1">
        <h2 className="relative -top-px m-0 text-[17px] leading-[23px] font-semibold tracking-[0.35px] text-[#0b1027] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:text-[19px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:leading-[26px]">
          Secure sign-in with Microsoft
        </h2>
        <p className="relative top-[3px] m-0 origin-center scale-y-90 text-[15px] leading-[21px] tracking-[-0.12px] text-[#4b5677] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:text-lg [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:leading-6">
          Your organization’s data is protected.
        </p>
      </div>
    </div>
  );
}

function SecurityIcon() {
  return (
    <svg
      className="size-[27px] overflow-visible stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:size-[30px]"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 32 32"
      fill="none"
      data-slot="login-security-icon"
    >
      <path d="M16 3.5 25 7v7.35c0 6.12-3.45 10.69-9 14.15-5.55-3.46-9-8.03-9-14.15V7l9-3.5Z" />
      <rect x="11.5" y="14" width="9" height="8" rx="1.5" />
      <path d="M13.5 14v-2a2.5 2.5 0 0 1 5 0v2" />
      <circle cx="16" cy="18" r="0.9" className="fill-current stroke-none" />
    </svg>
  );
}
