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
      className={cn('brand-loader', fullScreen && 'brand-loader--fullscreen', className)}
      data-slot="brand-loader"
      role="status"
      aria-atomic="true"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="brand-loader__visual" aria-hidden="true">
        <span className="brand-loader__glow" />
        <span className="brand-loader__orbit" />
        <span className="brand-loader__mark">
          {/* The favicon is already fetched as a browser asset during startup. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-loader__image" src="/favicon.ico" alt="" width={64} height={64} />
        </span>
      </div>

      <span className="brand-loader__copy">
        <strong>Onboarding Accelerator</strong>
        <span>{message}</span>
      </span>
    </div>
  );
}
