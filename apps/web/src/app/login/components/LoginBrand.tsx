import React from 'react';

export function LoginBrand() {
  return (
    <div
      className="relative z-1 mb-6 flex aspect-[339/119] h-auto w-[min(339px,calc(100vw-40px))] flex-none items-center [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:mb-[46px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:h-[119px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:w-[339px] [@media_(min-width:1100px)_and_(min-height:700px)_and_(min-aspect-ratio:4/3)]:-translate-x-px"
      role="img"
      aria-label="Onboarding Accelerator"
      data-slot="login-brand"
    >
      <span
        className="relative block h-full w-[36.6%] flex-[0_0_36.6%] overflow-hidden"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="absolute top-[-3.4%] left-[-8.1%] h-[107.6%] w-[116.1%] max-w-none object-contain"
          src="/favicon.ico?v=3"
          alt=""
          width={144}
          height={128}
        />
      </span>
      <span
        className="relative top-[-3px] ml-[7.6%] flex w-[55.8%] flex-[0_0_55.8%] origin-center scale-y-[0.94] flex-col text-[clamp(26px,10vw,36px)] leading-[1.02] font-medium whitespace-nowrap text-[#171717]"
        aria-hidden="true"
      >
        <span>Onboarding</span>
        <span className="text-[#d69b27]">Accelerator</span>
      </span>
    </div>
  );
}
