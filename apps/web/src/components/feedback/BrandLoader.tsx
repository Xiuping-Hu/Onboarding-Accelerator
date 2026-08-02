import React from 'react';
import { cn } from '@/lib/utils';

type BrandLoaderProps = {
  className?: string;
  fullScreen?: boolean;
  message?: string;
};

export function BrandLoader({
  className,
  fullScreen = false,
  message = 'Getting things ready',
}: BrandLoaderProps) {
  return (
    <div
      className={cn(
        'inline-grid place-content-center place-items-center gap-4.5 text-center text-slate-800',
        fullScreen &&
          'fixed inset-0 z-50 min-h-dvh bg-[radial-gradient(circle_at_50%_46%,rgb(215_169_50_/_15%),transparent_25%),linear-gradient(145deg,#fff_0%,#f7f8fb_52%,#eef1f6_100%)] p-6',
        className,
      )}
      data-slot="brand-loader"
      role="status"
      aria-atomic="true"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="relative isolate grid size-24 place-items-center" aria-hidden="true">
        <span className="absolute inset-3.5 -z-10 animate-pulse rounded-[20px] bg-[rgb(213_166_43_/_24%)] blur-[18px] motion-reduce:animate-none" />
        <span className="absolute inset-[3px] animate-spin rounded-full border border-black/10 border-t-[#c79620] border-r-[#c796206b] motion-reduce:animate-none after:absolute after:top-1.5 after:right-[11px] after:size-[7px] after:rounded-full after:border-2 after:border-white after:bg-[#c79620] after:shadow-[0_2px_8px_rgb(95_70_11_/_30%)] after:content-['']" />
        <span className="grid size-[68px] place-items-center rounded-[20px] border border-black/8 bg-white/90 shadow-[0_16px_36px_rgb(15_23_42_/_14%),inset_0_1px_0_#fff]">
          {/* Keep this purpose-sized asset small so the post-login transition appears immediately. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="block size-12 object-contain"
            src="/loading-icon.png"
            alt=""
            width={48}
            height={48}
          />
        </span>
      </div>

      <span className="grid gap-1.5">
        <strong className="text-[15px] font-bold tracking-[0.01em] text-[#202020]">
          Onboarding Accelerator
        </strong>
        <span className="text-[13px] font-semibold text-slate-500">{message}</span>
      </span>
    </div>
  );
}
